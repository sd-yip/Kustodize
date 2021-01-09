#!/usr/bin/env node
const { program } = require('@caporal/core')
const { generate } = require('./dist')

program
  .logger({ error: (message) => console.error(`error: ${message}`) })
  .command('build', 'Print configuration per contents of kustomization.yaml')
  .argument('[path]', 'Directory that contains kustomization.yaml', { default: '.' })
  .action(async ({ args }) => console.log(await generate(args.path.toString())))
  .command('generate', "Output processed directory contents to '/build'")
  .argument('[path]', 'Directory that contains kustomization.yaml', { default: '.' })
  .action(async ({ args }) => console.log(await generate(args.path.toString())))
  .command('version', 'Prints the kustodize version')
  .action(() => console.log(program.getVersion()))

program.disableGlobalOption('-V')
program.disableGlobalOption('--no-color')
program.disableGlobalOption('-v')
program.disableGlobalOption('--quiet')
program.disableGlobalOption('--silent')
program.run()
