import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { basename, parse, relative, resolve } from 'path'
import { filter, flatMap } from 'streaming-iterables'
import { renderFile } from 'twig'
import { promisify } from 'util'

async function* just<T>(element: T) {
  yield element
}

async function head<T>(elements: AsyncIterableIterator<T>): Promise<T | undefined> {
  return (await elements.next()).value
}

const exists = (path: string) => fs.access(path).then(() => true).catch(() => false)

async function isDirectory<T>(path: string) {
  return (await fs.lstat(path)).isDirectory()
}

async function* listFiles(path: string) {
  for (const name of await fs.readdir(path)) {
    yield resolve(path, name)
  }
}

const createParentDirectories = (path: string) => fs.mkdir(resolve(path, '..'), { recursive: true })

const writeFile = (path: string, content: string) => fs.writeFile(path, content)

async function walk(path: string): Promise<AsyncIterableIterator<string>> {
  return await isDirectory(path) ? flatMap(walk, listFiles(path)) : just(path)
}

async function* parents(path: string, root: string = parse(resolve(path)).root): AsyncIterableIterator<string> {
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

  for await (const p of flatMap(walk, filter(s => basename(s) !== 'build', listFiles(projectRoot)))) {
    const output = resolve(buildDirectory, relative(projectRoot, p))
    await createParentDirectories(output)
    const grandparent = resolve(p, '..', '..')

    if (basename(grandparent) === 'secret' && await exists(resolve(grandparent, '..', 'kustomization.yaml'))) {
      if (process.env['ANSIBLE_VAULT_PASSWORD_FILE'] === undefined) {
        throw "Environment variable 'ANSIBLE_VAULT_PASSWORD_FILE' is not set."
      }
      await execute('ansible-vault', ['decrypt', p, '--output', output], 'ignore')
    } else {
      await writeFile(output, await promisify(renderFile as any)(p, process.env))
    }
  }
  return resolve(buildDirectory, relative(projectRoot, path))
}

export async function build(path: string) {
  await execute('kustomize', ['build', await generate(path)], 'inherit')
}
