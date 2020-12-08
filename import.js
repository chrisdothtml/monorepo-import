#! /usr/bin/env node

const dedent = require('dedent')
const Importer = require('./Importer.js')

main(process.argv.slice(2))

function main(args) {
  if (args[0] === '-h' || args[0] === '--help') {
    console.log(dedent`
      @chrisdothtml/monorepo-import
      For importing an external repo into a monorepo subdirectory with git history/blame intact

      # Usage:
      monorepo-import --help
      monorepo-import <external-repo-path> <monorepo-path> <sub-directory>

      # Examples:
      monorepo-import ../external-repo ../monorepo external-repo
      monorepo-import ../my-project ../monorepo projects/my-project
    `)
  } else {
    const [externalRepoPath, monorepoPath, subDirectory] = args
    const importer = new Importer({
      externalRepoPath,
      monorepoPath,
      subDirectory,
    })

    importer.initialize()
    importer.execute()
  }
}
