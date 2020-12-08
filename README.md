# monorepo-import

> For importing an external repo into a monorepo subdirectory with git history/blame intact

This tool is forked from `lerna import`, and is intended to allow for using that logic generically with non-lerna monorepos.

## Install

```sh
yarn global add @chrisdothtml/monorepo-import
# or
npm install -g @chrisdothtml/monorepo-import
# or
volta install @chrisdothtml/monorepo-import
```

## Use

```sh
# Usage:
monorepo-import --help
monorepo-import <external-repo-path> <monorepo-path> <sub-directory>

# Examples:
monorepo-import ../external-repo ../monorepo external-repo
monorepo-import ../my-project ../monorepo projects/my-project
```

When you use this to import an external repo into your monorepo:

- it will apply every commit of `<external-repo-path>` one-by-one on top of HEAD of `<monorepo-path>`
- file paths throughout the entire repo history are prefixed by your provided `<sub-directory>`
- original commit author, committer, and date are all preserved
