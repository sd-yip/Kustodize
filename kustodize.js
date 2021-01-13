#!/usr/bin/env node
const { program } = require('@caporal/core')
const { resolve } = require('path')
const kustodize = require('./dist')

process.on('uncaughtException', e => {
  console.error(`error: Uncaught exception encountered after '${kustodize.lastUnsafeAction}'`)
  console.error(`error: ${e}`)
  process.exit(1)
})

program
  .logger({ error: (message) => console.error(`error: ${message}`) })
  .command('build', 'Print configuration per contents of kustomization.yaml')
  .argument('[path]', 'Directory that contains kustomization.yaml', { default: '.' })
  .action(({ args }) => kustodize.build(args.path.toString()))
  .command('generate', "Output processed directory contents to '/build'")
  .argument('[path]', 'Directory that contains kustomization.yaml', { default: '.' })
  .action(async ({ args }) => console.log(await kustodize.generate(args.path.toString())))
  .command('version', 'Prints the kustodize version')
  .action(() => console.log(require(resolve(__filename, '..', 'package.json')).version))

program.disableGlobalOption('-V')
program.disableGlobalOption('--no-color')
program.disableGlobalOption('-v')
program.disableGlobalOption('--quiet')
program.disableGlobalOption('--silent')
program.run()
