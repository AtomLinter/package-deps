/* @flow */

import Path from 'path'
import tildify from 'tildify'
import { exec } from 'sb-exec'
import ConfigFile from 'sb-config-file'
import type { Dependency } from './types'

let shownStorageInfo = false
const VALID_TICKS = new Set(['✓', 'done'])
const VALIDATION_REGEXP = /(?:Installing|Moving) (.*?) to .* (.*)/

export function apmInstall(dependencies: Array<Dependency>, progressCallback: ((packageName: string, status: boolean) => void)): Promise<Map<string, Error>> {
  const errors = new Map()
  return Promise.all(dependencies.map(function(dependency) {
    return exec(atom.packages.getApmPath(), ['install', dependency.url, '--production', '--color', 'false'], {
      stream: 'both',
      ignoreExitCode: true,
    }).then(function(output) {
      const successful = VALIDATION_REGEXP.test(output.stdout) && VALID_TICKS.has(VALIDATION_REGEXP.exec(output.stdout)[2])
      progressCallback(dependency.name, successful)
      if (!successful) {
        const error = new Error(`Error installing dependency: ${dependency.name}`)
        error.stack = output.stderr
        throw error
      }
    }).catch(function(error) {
      errors.set(dependency.name, error)
    })
  })).then(function() {
    return errors
  })
}

export async function enablePackage(packageName: string): Promise<void> {
  if (atom.packages.isPackageDisabled(packageName)) {
    atom.packages.enablePackage(packageName)
  }
  if (!atom.packages.isPackageLoaded(packageName)) {
    atom.packages.loadPackage(packageName)
  }
  if (!atom.packages.isPackageActive(packageName)) {
    await atom.packages.activatePackage(packageName)
  }
}

export function getDependencies(packageName: string): Array<Dependency> {
  const toReturn = []
  const packageModule = atom.packages.getLoadedPackage(packageName)
  const packageDependencies = packageModule && packageModule.metadata['package-deps']

  if (packageDependencies) {
    for (const entry of (packageDependencies: Array<string>)) {
      let entryName = entry
      let entryUrl = entry

      if (entry.indexOf('#') > -1) {
        [entryName, entryUrl] = entry.split('#')
      }

      if (__steelbrain_package_deps.has(entryName) || atom.packages.resolvePackagePath(entryName)) {
        continue
      }
      __steelbrain_package_deps.add(entryName)
      toReturn.push({
        url: entryUrl,
        name: entryName,
      })
    }
  } else {
    console.error(`[Package-Deps] Unable to get loaded package '${packageName}'`)
  }

  return toReturn
}

export async function promptUser(packageName: string, dependencies: Array<Dependency>): Promise<'Yes' | 'No' | 'Never'> {
  const configPath = Path.join(atom.getConfigDirPath(), 'package-deps-state.json')
  const configFile = await ConfigFile.get(configPath, { ignored: [] }, { createIfNonExistent: true })
  const ignoredPackages = await configFile.get('ignored')
  if (ignoredPackages.includes(packageName)) {
    return Promise.resolve('No')
  }

  return await new Promise(function(resolve) {
    const notification = atom.notifications.addInfo(`${packageName} needs to install dependencies`, {
      dismissable: true,
      icon: 'cloud-download',
      detail: dependencies.map(e => e.name).join(', '),
      description: `Install dependenc${dependencies.length === 1 ? 'y' : 'ies'}?`,
      buttons: [{
        text: 'Yes',
        onDidClick: () => {
          resolve('Yes')
          notification.dismiss()
        },
      }, {
        text: 'No Thanks',
        onDidClick: () => {
          resolve('No')
          notification.dismiss()
        },
      }, {
        text: 'Never',
        onDidClick: () => {
          configFile.append('ignored', packageName)
          if (!shownStorageInfo) {
            shownStorageInfo = true
            atom.notifications.addInfo('How to reset package-deps memory', {
              dismissable: true,
              description: `If you ever wish to change the packages package-deps never installs, please modify ${tildify(configPath)}`,
            })
          }
          resolve('Never')
          notification.dismiss()
        },
      }],
    })
    notification.onDidDismiss(() => resolve('No'))
  })
}
