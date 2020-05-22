# monorepo-import

> For importing an external repo into a monorepo subdirectory with git history/blame intact

This tool is forked from `lerna import`, and is intended to allow for using that logic generically with non-lerna monorepos.

## Use

```
# install deps
yarn

# run
node import.js <external-repo-path> <monorepo-path> <sub-directory>

# examples
node import.js ../monorepo ../external-repo external-repo
node import.js ../monorepo ../my-project projects/my-project
```
