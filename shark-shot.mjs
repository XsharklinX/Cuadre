import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
await page.goto('http://localhost:3000')
await page.waitForTimeout(4000)
await page.screenshot({ path: 'shark-home.png' })
await browser.close()
