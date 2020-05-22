// forked from `lerna import` and stripped down
// original: https://github.com/lerna/lerna/blob/3367257/commands/import/index.js

const path = require('path')
const dedent = require('dedent')
const fs = require('fs-extra')
const pMapSeries = require('p-map-series')
const execa = require('execa')

function spawnProcess(command, args, opts) {
  const child = execa(command, args, opts)
  const drain = (code, signal) => {
    // don't run repeatedly if this is the error event
    if (signal === undefined) {
      child.removeListener('exit', drain)
    }
  }

  child.once('exit', drain)
  child.once('error', drain)
  return child
}

function exec(command, args, opts) {
  const options = Object.assign({ stdio: 'pipe' }, opts)
  return spawnProcess(command, args, options)
}

function execSync(command, args, opts) {
  return execa.sync(command, args, opts).stdout
}

module.exports = class Importer {
  constructor(opts) {
    this.opts = opts
  }

  initialize() {
    const { opts } = this
    const inputPath = opts.externalRepoPath

    const monorepoPath = path.resolve(opts.monorepoPath)
    const externalRepoPath = path.resolve(inputPath)

    this.execOpts = {
      cwd: monorepoPath,
    }
    this.externalExecOpts = Object.assign({}, this.execOpts, {
      cwd: externalRepoPath,
    })

    let stats

    try {
      stats = fs.statSync(externalRepoPath)
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error(`No repository found at "${inputPath}"`)
      }

      throw e
    }

    if (!stats.isDirectory()) {
      throw new Error(`External repo path "${inputPath}" is not a directory`)
    }

    const targetDir = opts.subDirectory

    // Compute a target directory relative to the Git root
    const gitRepoRoot = this.execSync('git', ['rev-parse', '--show-toplevel'])
    const lernaRootRelativeToGitRoot = path.relative(gitRepoRoot, monorepoPath)
    this.targetDirRelativeToGitRoot = path.join(
      lernaRootRelativeToGitRoot,
      targetDir
    )

    if (fs.existsSync(path.resolve(monorepoPath, targetDir))) {
      throw new Error(`Target directory already exists "${targetDir}"`)
    }

    this.commits = this.externalExecSync('git', [
      'log',
      '--format=%h',
      // flatten un-squashed merges
      '--first-parent',
    ])
      .split('\n')
      .reverse()

    if (!this.commits.length) {
      throw new Error(`No git commits to import at "${inputPath}"`)
    }

    // Back these up since they'll change for each commit
    this.origGitEmail = this.execSync('git', ['config', 'user.email'])
    this.origGitName = this.execSync('git', ['config', 'user.name'])

    // Stash the repo's pre-import head away in case something goes wrong.
    this.preImportHead = this.execSync('git', ['rev-parse', 'HEAD'])

    this.execSync('git', ['diff'], this.execOpts)
    if (this.execSync('git', ['diff-index', 'HEAD'])) {
      throw new Error('Local repository has un-committed changes')
    }

    console.info(
      `About to import ${this.commits.length} commits from ${inputPath} into ${targetDir}`
    )
  }

  execSync(cmd, args) {
    return execSync(cmd, args, this.execOpts)
  }

  externalExecSync(cmd, args) {
    return execSync(cmd, args, this.externalExecOpts)
  }

  createPatchForCommit(sha) {
    const diff = this.externalExecSync('git', [
      'log',
      '--reverse',
      '--first-parent',
      '-p',
      '-m',
      '--pretty=email',
      '--stat',
      '--binary',
      '-1',
      '--color=never',
      sha,
      // custom git prefixes for accurate parsing of filepaths (#1655)
      `--src-prefix=COMPARE_A/`,
      `--dst-prefix=COMPARE_B/`,
    ])
    const version = this.externalExecSync('git', ['--version']).replace(
      /git version /g,
      ''
    )
    const patch = `${diff}\n--\n${version}`

    const formattedTarget = this.targetDirRelativeToGitRoot.replace(/\\/g, '/')
    const replacement = `$1/${formattedTarget}`

    // Create a patch file for this commit and prepend the target directory
    // to all affected files.  This moves the git history for the entire
    // external repository into the package subdirectory, commit by commit.
    return patch
      .replace(/^([-+]{3} COMPARE_[AB])/gm, replacement)
      .replace(/^(diff --git COMPARE_A)/gm, replacement)
      .replace(/^(diff --git (?! COMPARE_B\/).+ COMPARE_B)/gm, replacement)
      .replace(/^(copy (from|to)) /gm, `$1 ${formattedTarget}/`)
      .replace(/^(rename (from|to)) /gm, `$1 ${formattedTarget}/`)
  }

  getGitUserFromSha(sha) {
    const sep = '|||'
    const [email, name] = this.externalExecSync('git', [
      'show',
      '-s',
      `--format='%ce${sep}%cn'`,
      sha,
    ]).split(sep)

    return { email, name }
  }

  configureGitUser({ email, name }) {
    this.execSync('git', ['config', 'user.email', `"${email}"`])
    this.execSync('git', ['config', 'user.name', `"${name}"`])
  }

  execute() {
    const mapper = (sha) => {
      console.info(`Applying ${sha}`)
      const patch = this.createPatchForCommit(sha)
      const procArgs = ['am', '-3', '--keep-non-patch']

      this.configureGitUser(this.getGitUserFromSha(sha))
      procArgs.push('--committer-date-is-author-date')

      // Apply the modified patch to the current lerna repository, preserving
      // original commit date, author and message.
      //
      // Fall back to three-way merge, which can help with duplicate commits
      // due to merge history.
      const proc = exec('git', procArgs, this.execOpts)

      proc.stdin.end(patch)

      return proc.catch((err) => {
        if (err.stdout.indexOf('Patch is empty.') === 0) {
          // Automatically skip empty commits
          return exec('git', ['am', '--skip'], this.execOpts)
        }

        err.sha = sha
        throw err
      })
    }

    return pMapSeries(this.commits, mapper)
      .then(() => {
        this.configureGitUser({
          email: this.origGitEmail,
          name: this.origGitName,
        })
        console.info('finished')
      })
      .catch((err) => {
        this.configureGitUser({
          email: this.origGitEmail,
          name: this.origGitName,
        })
        console.error(
          `Rolling back to previous HEAD (commit ${this.preImportHead})`
        )

        // Abort the failed `git am` and roll back to previous HEAD.
        this.execSync('git', ['am', '--abort'])
        this.execSync('git', ['reset', '--hard', this.preImportHead])

        throw new Error(dedent`
          Failed to apply commit ${err.sha}.
          ${err.message}
        `)
      })
  }
}
