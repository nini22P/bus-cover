#! /usr/bin/env node

import fs from 'fs'
import path from 'path'
import * as puppeteer from 'puppeteer'
import { promisify } from 'util'
import figlet from "figlet"
import { Command } from 'commander'

interface File {
  name: string,
  isDir: boolean,
  extName: string,
}

const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.flv', '.wmv']
const sleep = promisify(setTimeout)

const findDir = async (dirPath: string) => {
  try {
    const files = await fs.promises.readdir(dirPath)

    const results: File[] = await Promise.all(files.map(async (file) => {
      const filePath = path.join(dirPath, file)
      const stats = await fs.promises.stat(filePath)

      return {
        name: file,
        isDir: stats.isDirectory(),
        extName: path.extname(file),
      }
    }))

    return results
      .filter(file => file.name.includes('-') && (file.isDir || videoExtensions.includes(file.extName.toLocaleLowerCase())))
      .map(file => ({ ...file, name: [file.name.split('-')[0], file.name.split('-')[1].split(' ')[0]].join('-') }))
      .reduce((accumulator: File[], current: File) => {
        const x = accumulator.find(item => item.name === current.name)
        if (!x) {
          return accumulator.concat([current])
        } else {
          return accumulator
        }
      }, [])
      .sort((a, b) => {
        const nameA = a.name.toUpperCase()
        const nameB = b.name.toUpperCase()
        if (nameA < nameB) {
          return -1
        }
        if (nameA > nameB) {
          return 1
        }

        return 0
      })
  } catch (err) {
    console.error('Not read dir', err)
    return []
  }
}

const getCover = async (page: puppeteer.Page, id: string, savePath: string) => {
  try {
    let url = `https://www.javbus.com/${id}`
    if (id.startsWith('DSVR')) {
      url = `https://www.javbus.com/3${id}`
    }
    await page.goto(url, { timeout: 600000 })
    await page.waitForSelector('script')

    const htmlContent = await page.content()

    const match = htmlContent.match(/var img = '(.*?)'/)

    if (match) {
      const coverPath = match[1]
      const viewSource = await page.goto(`https://www.javbus.com${coverPath}`)

      if (viewSource) {
        fs.writeFileSync(savePath, await viewSource.buffer())
        return id
      } else return
    }
  } catch (err) {
    return
  }
}

const run = async (debug: boolean) => {
  console.log(figlet.textSync("Bus Cover"))

  const browser = await puppeteer.launch({
    headless: !debug,
  })

  const pages = await browser.pages()
  const page = pages[0]

  await page.setRequestInterception(true)

  const blockedUrls = [
    '.gif',
    '/forum/',
    '/pics/sample/',
    '/pics/thumb/',
    'dmm.co.jp',
    'jads.co',
    '/ads/',
  ]

  page.on('request', (request) => {
    const url = request.url()
    const shouldAbort = blockedUrls.some(blockedUrl => url.includes(blockedUrl) || url.endsWith(blockedUrl))

    if (shouldAbort) {
      request.abort()
    } else {
      request.continue()
    }
  })

  try {
    const files = await findDir('./')

    for (const [index, file] of files.entries()) {
      const id = file.isDir ? file.name : path.basename(file.name, path.extname(file.name))
      const savePath = file.isDir ? `./${file.name}/${id}.jpg` : `./${id}.jpg`
      if (fs.existsSync(savePath)) {
        console.log(`${index + 1} / ${files.length} Skipped: ${id}`)
      } else {
        const result = await getCover(page, id, savePath)
        if (result) {
          console.log(`${index + 1} / ${files.length} Success: ${id}`)
          if (index < files.length - 1) {
            await sleep(10000)
          }
        } else {
          console.log(`${index + 1} / ${files.length} Failed: ${id}`)
          if (index < files.length - 1) {
            await sleep(10000)
          }
        }
      }
    }
  } catch (err) {
    console.error('Error: ', err)
  } finally {
    await browser.close()
  }
}

const program = new Command()

program
  .version('1.0.0')
  .option('-d, --debug', 'Run in debug mode (non-headless)')
  .parse(process.argv)

const options = program.opts()
const debug = options.debug || false

run(debug)