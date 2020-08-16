#!/usr/bin/env node
import path from 'path'
import { install } from './index'

if (process.argv.length !== 3) {
  console.error('Usage: atom-package-deps <directory>')
  process.exit(1)
}
const [, , directory] = process.argv

async function main() {
  const resolved = path.resolve(process.cwd(), directory)
  await install(resolved)
  console.log('All Done!')
}

main().catch((error) => {
  if (process.env.STEELBRAIN_DEBUG) {
    console.error('Error:', error?.stack ?? error)
  } else {
    console.error('Error:', error.message)
    process.exit(1)
  }
})
