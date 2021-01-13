import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import ignore from 'ignore'
import { basename, parse, relative, resolve } from 'path'
import { filter, flatMap } from 'streaming-iterables'
import { renderFile } from 'twig'
import { promisify } from 'util'

function y<T, R>(next: (f: (t: T) => R) => (t: T) => R): (t: T) => R {
  return t => next(y(next))(t)
}

async function* empty() {
}

async function* just<T>(element: T) {
  yield element
}

async function head<T>(elements: AsyncIterator<T>): Promise<T | undefined> {
  return (await elements.next()).value
}

const exists = (path: string) => fs.access(path).then(() => true).catch(() => false)

async function isDirectory(path: string) {
  return (await fs.lstat(path)).isDirectory()
}

async function* listFiles(path: string) {
  for (const name of await fs.readdir(path)) {
    yield resolve(path, name)
  }
}

const createParentDirectories = (path: string) => fs.mkdir(resolve(path, '..'), { recursive: true })

const walk = (filter: (p: string) => boolean) => y<string, Promise<AsyncGenerator<string>>>(next => async path =>
  !filter(path) ? empty() : await isDirectory(path) ? flatMap(next, listFiles(path)) : just(path)
)

async function* parents(path: string, root: string = parse(resolve(path)).root): AsyncGenerator<string> {
  yield path

  if (path !== root) {
    yield* parents(resolve(path, '..'), root)
  }
}

const execute = (command: string, parameters: string[], stdout: 'ignore' | 'inherit') =>
  new Promise((resolve, reject) => {
    const childProcess = spawn(command, parameters, { stdio: ['ignore', stdout, 'inherit'] })

    childProcess.on('exit', code =>
      code === 0 ? resolve(null) : reject(`Execution of '${command}' failed.`)
    )
    childProcess.on('error', reject)
  })

const randomString = () => randomBytes(18)
  .toString('base64')
  .replace(/[+/]/g, c => c === '+' ? '-' : '_')

export async function generate(path: string) {
  if (!await exists(path)) {
    throw `'${path}' not found.`
  }
  const projectRoot: string | undefined =
    await head(filter(s => exists(resolve(s, 'kustodization.yaml')), parents(path)))

  if (projectRoot === undefined) {
    throw "'kustodization.yaml' not found."
  }
  const buildDirectory = resolve(projectRoot, 'build', 'kustodize', randomString())
  const renderOptions = { ...process.env, settings: { 'twig options': { rethrow: true, strict_variables: true } } }
  const patterns = ignore().add(['/build', '.git']).createFilter()

  for await (const p of flatMap(walk(p => patterns(relative(projectRoot, p))), listFiles(projectRoot))) {
    if (basename(p) === 'kustodization.yaml' && resolve(p, '..') !== resolve(projectRoot)) {
      throw `Nested definition as in '${p}' is not supported.`
    }
    const output = resolve(buildDirectory, relative(projectRoot, p))
    await createParentDirectories(output)
    const grandparent = resolve(p, '..', '..')

    if (basename(grandparent) === 'secret' && await exists(resolve(grandparent, '..', 'kustomization.yaml'))) {
      if (process.env['ANSIBLE_VAULT_PASSWORD_FILE'] === undefined) {
        throw "Environment variable 'ANSIBLE_VAULT_PASSWORD_FILE' is not set."
      }
      await execute('ansible-vault', ['decrypt', p, '--output', output], 'ignore')
    } else {
      lastUnsafeAction = `rendering ${p}`

      await fs.writeFile(output, await promisify(renderFile as any)(p, renderOptions))
    }
  }
  return resolve(buildDirectory, relative(projectRoot, path))
}

export async function build(path: string) {
  await execute('kustomize', ['build', await generate(path)], 'inherit')
}

export let lastUnsafeAction: string | undefined
