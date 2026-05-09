#!/usr/bin/env node
/**
 * Gera /public/og-image.png (1200x630) a partir do símbolo OnDoctor sobre fundo
 * com a cor da marca, para usar como preview em redes sociais (og:image).
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SYMBOL = resolve(ROOT, 'public', 'assets', 'ondoctor-symbol.png')
const OUT = resolve(ROOT, 'public', 'og-image.png')

const W = 1200, H = 630
const BRAND = '#289D8F'
const BRAND_DARK = '#14776c'

// SVG de fundo com gradiente + texto
const titleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="${BRAND_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="${W / 2}" y="${H / 2 + 130}" font-family="Ubuntu, sans-serif" font-weight="700" font-size="68" fill="white" text-anchor="middle">OnDoctor</text>
  <text x="${W / 2}" y="${H / 2 + 185}" font-family="Ubuntu, sans-serif" font-weight="300" font-size="32" fill="rgba(255,255,255,0.85)" text-anchor="middle">Documentação Oficial</text>
</svg>`

// Símbolo do OnDoctor preparado em branco
const symbolBuffer = readFileSync(SYMBOL)
const symbolWhite = await sharp(symbolBuffer)
  .resize(220, 220, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .composite([{
    input: Buffer.from(`<svg width="220" height="220"><rect width="220" height="220" fill="white"/></svg>`),
    blend: 'in'
  }])
  .png()
  .toBuffer()

const composed = await sharp(Buffer.from(titleSvg))
  .composite([{ input: symbolWhite, top: H / 2 - 200, left: W / 2 - 110 }])
  .png({ compressionLevel: 9 })
  .toBuffer()

writeFileSync(OUT, composed)

const sizeKB = (composed.length / 1024).toFixed(1)
console.log(`Gerado: ${OUT}`)
console.log(`Dimensões: ${W}x${H}`)
console.log(`Tamanho: ${sizeKB} KB`)
