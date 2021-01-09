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

const writeFile = (path: string, content: string) =>
  fs.mkdir(resolve(path, '..'), { recursive: true }).then(() => fs.writeFile(path, content))

async function walk(path: string): Promise<AsyncIterableIterator<string>> {
  return await isDirectory(path) ? flatMap(walk, listFiles(path)) : just(path)
}

async function* parents(path: string, root: string = parse(resolve(path)).root): AsyncIterableIterator<string> {
  yield path

  if (path !== root) {
    yield* parents(resolve(path, '..'), root)
  }
}

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
    await writeFile(
      resolve(buildDirectory, relative(projectRoot, p)),
      await promisify(renderFile as any)(p, process.env)
    )
  }
  return resolve(buildDirectory, relative(projectRoot, path))
}
