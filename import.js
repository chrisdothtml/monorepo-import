const Importer = require('./Importer.js')

main(process.argv.slice(2))

function main(args) {
  const [externalRepoPath, monorepoPath, subDirectory] = args
  const importer = new Importer({
    externalRepoPath,
    monorepoPath,
    subDirectory,
  })

  importer.initialize()
  importer.execute()
}
