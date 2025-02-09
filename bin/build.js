#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const https = require('https')
const { promisify } = require('util')
const async = require('async')
const unzip = require('unzipper')
const Encoding = require('encoding-japanese')
const iconv = require('iconv-lite')
const csvParse = require('csv-parse/lib/sync')
const cliProgress = require('cli-progress')
const performance = require('perf_hooks').performance
const kanji2number = require('@geolonia/japanese-numeral').kanji2number
const turfCenter = require('@turf/center').default
const turfNearestPoint = require('@turf/nearest-point').default
const { featureCollection, point } = require('@turf/helpers')
const sqlite3 = require('sqlite3')
const exportToCsv = require('../lib/export-to-csv')
const sortAddresses = require('../lib/sort-addresses')
const getPostalKanaOrRomeItems = require('../lib/get-postal-kana-or-rome-items')
const importPatches = require('../lib/import-patches')
const createRecordKey = require('../lib/create-record-key')

const sleep = promisify(setTimeout)

const dataDir = path.join(path.dirname(path.dirname(__filename)), 'data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir)
}

const db = new sqlite3.Database(path.join(dataDir, 'latest.db'))

const isjRenames = [
  { pref: '兵庫県', orig: '篠山市', renamed: '丹波篠山市' },
  { pref: '福岡県', orig: '筑紫郡那珂川町', renamed: '那珂川市' },
]

const prefNames = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
]

const toPrefCode = prefNumber => {
  let prefCode = prefNumber.toString()
  if (prefNumber < 10) {
    prefCode = `0${prefCode}`
  }
  return prefCode
}

const han2zenMap = {
  ｶﾞ: 'ガ',
  ｷﾞ: 'ギ',
  ｸﾞ: 'グ',
  ｹﾞ: 'ゲ',
  ｺﾞ: 'ゴ',
  ｻﾞ: 'ザ',
  ｼﾞ: 'ジ',
  ｽﾞ: 'ズ',
  ｾﾞ: 'ゼ',
  ｿﾞ: 'ゾ',
  ﾀﾞ: 'ダ',
  ﾁﾞ: 'ヂ',
  ﾂﾞ: 'ヅ',
  ﾃﾞ: 'デ',
  ﾄﾞ: 'ド',
  ﾊﾞ: 'バ',
  ﾋﾞ: 'ビ',
  ﾌﾞ: 'ブ',
  ﾍﾞ: 'ベ',
  ﾎﾞ: 'ボ',
  ﾊﾟ: 'パ',
  ﾋﾟ: 'ピ',
  ﾌﾟ: 'プ',
  ﾍﾟ: 'ペ',
  ﾎﾟ: 'ポ',
  ｳﾞ: 'ヴ',
  ﾜﾞ: 'ヷ',
  ｦﾞ: 'ヺ',
  ｱ: 'ア',
  ｲ: 'イ',
  ｳ: 'ウ',
  ｴ: 'エ',
  ｵ: 'オ',
  ｶ: 'カ',
  ｷ: 'キ',
  ｸ: 'ク',
  ｹ: 'ケ',
  ｺ: 'コ',
  ｻ: 'サ',
  ｼ: 'シ',
  ｽ: 'ス',
  ｾ: 'セ',
  ｿ: 'ソ',
  ﾀ: 'タ',
  ﾁ: 'チ',
  ﾂ: 'ツ',
  ﾃ: 'テ',
  ﾄ: 'ト',
  ﾅ: 'ナ',
  ﾆ: 'ニ',
  ﾇ: 'ヌ',
  ﾈ: 'ネ',
  ﾉ: 'ノ',
  ﾊ: 'ハ',
  ﾋ: 'ヒ',
  ﾌ: 'フ',
  ﾍ: 'ヘ',
  ﾎ: 'ホ',
  ﾏ: 'マ',
  ﾐ: 'ミ',
  ﾑ: 'ム',
  ﾒ: 'メ',
  ﾓ: 'モ',
  ﾔ: 'ヤ',
  ﾕ: 'ユ',
  ﾖ: 'ヨ',
  ﾗ: 'ラ',
  ﾘ: 'リ',
  ﾙ: 'ル',
  ﾚ: 'レ',
  ﾛ: 'ロ',
  ﾜ: 'ワ',
  ｦ: 'ヲ',
  ﾝ: 'ン',
  ｧ: 'ァ',
  ｨ: 'ィ',
  ｩ: 'ゥ',
  ｪ: 'ェ',
  ｫ: 'ォ',
  ｯ: 'ッ',
  ｬ: 'ャ',
  ｭ: 'ュ',
  ｮ: 'ョ',
  '｡': '。',
  '､': '、',
  ｰ: 'ー',
  '｢': '「',
  '｣': '」',
  '･': '・',
}
const HAN2ZEN_REGEXP = new RegExp('(' + Object.keys(han2zenMap).join('|') + ')', 'g')
const han2zen = str => str.replace(HAN2ZEN_REGEXP, match => han2zenMap[match])

const removeUnnecessarySpace = text => {
  return text.replace('　', '').trim()
}

const GET_CHOME_NUMBER_REGEX = /([二三四五六七八九]?十?[一二三四五六七八九]?)丁目?$/
const getChomeNumber = (text, suffix = '') => {
  const match = text.match(GET_CHOME_NUMBER_REGEX)
  if (match && match[1]) {
    return kanji2number(match[1]) + suffix
  } else {
    return ''
  }
}

const REMOVE_STRING_IN_PARENS_REGEX = /\(.+\)$/
const removeStringEnclosedInParentheses = text => {
  return text.replace(REMOVE_STRING_IN_PARENS_REGEX, '')
}

const _downloadZippedFile = (url, path) => new Promise(resolve => {
  https.get(url, res => {
    res
      .pipe(unzip.Parse())
      .on('entry', entry => {
        entry
          .pipe(fs.createWriteStream(path))
          .on('finish', () => {
            resolve(path)
          })
      })
  })
})

const downloadPostalCodeKana = async () => {
  const url = 'https://www.post.japanpost.jp/zipcode/dl/kogaki/zip/ken_all.zip'
  const csvPath = `${dataDir}/postalcode_kogaki.csv`
  if (!fs.existsSync(csvPath)) {
    await _downloadZippedFile(url, csvPath)
  }
  const buffer = await fs.promises.readFile(csvPath)
  const text = Encoding.convert(buffer, {
    from: 'SJIS',
    to: 'UNICODE',
    type: 'string',
  })
  const json = csvParse(text, {
    columns: [
      '全国地方公共団体コード',
      '（旧）郵便番号',
      '郵便番号',
      '都道府県名カナ',
      '市区町村名カナ',
      '町域名カナ',
      '都道府県名',
      '市区町村名',
      '町域名',
      'hasMulti',
      'hasBanchiOnAza',
      'hasChomome',
      'hasAlias',
      'update',
      'updateReason',
    ],
  }).map(item => ({
    ...item,
    市区町村名: removeUnnecessarySpace(item['市区町村名']),
  }))
  return json
}

module.exports.downloadPostalCodeKana = downloadPostalCodeKana

const downloadPostalCodeRome = async () => {
  const url = 'https://www.post.japanpost.jp/zipcode/dl/roman/KEN_ALL_ROME.zip'
  const csvPath = `${dataDir}/postalcode_roman.csv`
  if (!fs.existsSync(csvPath)) {
    await _downloadZippedFile(url, csvPath)
  }
  const buffer = await fs.promises.readFile(csvPath)
  const text = Encoding.convert(buffer, {
    from: 'SJIS',
    to: 'UNICODE',
    type: 'string',
  })
  const json = csvParse(text, {
    columns: [
      '郵便番号',
      '都道府県名',
      '市区町村名',
      '町域名',
      '都道府県名ローマ字',
      '市区町村名ローマ字',
      '町域名ローマ字',
    ],
  }).map(item => ({
    ...item,
    市区町村名: removeUnnecessarySpace(item['市区町村名']),
    町域名: removeUnnecessarySpace(item['町域名']),
  }))
  return json
}

module.exports.downloadPostalCodeRome = downloadPostalCodeRome

const _downloadNlftpMlitFile = (prefCode, outPath, version) => new Promise((resolve, reject) => {
  const url = `https://nlftp.mlit.go.jp/isj/dls/data/${version}/${prefCode}000-${version}.zip`
  https.get(url, res => {
    let atLeastOneFile = false
    res.pipe(unzip.Parse()).on('entry', entry => {
      if (entry.type === 'Directory' || entry.path.slice(-4) !== '.csv') {
        return
      }
      atLeastOneFile = true
      const tmpOutPath = outPath + '.tmp'
      entry
        .pipe(iconv.decodeStream('Shift_JIS'))
        .pipe(fs.createWriteStream(tmpOutPath))
        .on('finish', () => {
          fs.renameSync(tmpOutPath, outPath)
          resolve(outPath)
        })
    }).on('end', () => {
      if (!atLeastOneFile) {
        reject(new Error('no CSV file detected in archive file'))
      }
    })
  })
})

// 位置参照情報(大字・町丁目レベル)から住所データを取得する
const getOazaAddressItems = async (prefCode, postalCodeKanaItems, postalCodeRomeItems, patchData) => {
  const records = patchData[prefCode] || {}

  const outPath = path.join(dataDir, `nlftp_mlit_130b_${prefCode}.csv`)

  while (!fs.existsSync(outPath)) {
    console.log(`${prefCode}: waiting for nlftp_mlit_130b_${prefCode}.csv...`)
    await sleep(1000)
  }

  const text = await fs.promises.readFile(outPath)

  const data = csvParse(text, {
    columns: true,
    skip_empty_lines: true,
  })

  const bar = new cliProgress.SingleBar()
  bar.start(data.length, 0)

  const dataLength = data.length
  for (let index = 0; index < dataLength; index++) {
    const line = data[index]

    bar.update(index + 1)

    const renameEntry =
      isjRenames.find(
        ({ pref, orig }) =>
        (pref === line['都道府県名'] &&
          orig === line['市区町村名']))
    const cityName = renameEntry ? renameEntry.renamed : line['市区町村名']

    const townName = removeUnnecessarySpace(line['大字町丁目名'])

    const postalCodeKanaItem = getPostalKanaOrRomeItems(
      line['都道府県名'], cityName, townName, postalCodeKanaItems, '市区町村名カナ', 'kana',
    )
    const postalCodeRomeItem = getPostalKanaOrRomeItems(
      line['都道府県名'], cityName, townName, postalCodeRomeItems, '市区町村名ローマ字', 'rome',
    )

    const recordKey = createRecordKey(line['都道府県名'], cityName, townName)

    // to avoid duplication
    if (records[recordKey]) {
      continue
    }

    const record = [
      prefCode,
      postalCodeKanaItem['郵便番号'],
      line['都道府県名'],
      postalCodeKanaItem
        ? han2zen(postalCodeKanaItem['都道府県名カナ'])
        : '',
      postalCodeRomeItem
        ? postalCodeRomeItem['都道府県名ローマ字']
        : '',
      line['市区町村コード'],
      cityName,
      postalCodeKanaItem
        ? han2zen(postalCodeKanaItem['市区町村名カナ'])
        : '',
      postalCodeRomeItem
        ? postalCodeRomeItem['市区町村名ローマ字']
        : '',
      townName,
      postalCodeKanaItem
        ? han2zen(removeStringEnclosedInParentheses(postalCodeKanaItem['町域名カナ'])) + (getChomeNumber(line['大字町丁目名']) !== '' ? ` ${getChomeNumber(line['大字町丁目名'])}` : '')
        : '',
      postalCodeRomeItem
        ? removeStringEnclosedInParentheses(postalCodeRomeItem['町域名ローマ字']) + (getChomeNumber(line['大字町丁目名']) !== '' ? ` ${getChomeNumber(line['大字町丁目名'])}` : '')
        : '',
      '',
      Number(line['緯度']),
      Number(line['経度']),
    ]

    records[recordKey] = record
  } // line iteration
  bar.stop()

  console.log(`${prefCode}: 大字・町丁目レベル ${Object.values(records).length}件`)

  return records
}

// 経度・緯度
let coords = {}
const addToCoords = (recordKey, lng, lat) => {
  // eslint-disable-next-line no-undefined
  if (coords[recordKey] === undefined) {
    coords[recordKey] = [[lng, lat]]
  } else {
    coords[recordKey].push([lng, lat])
  }
}

const getCenter = recordKey => {
  const arr = coords[recordKey]
  const features = featureCollection(
    arr.map(c => point(c)),
  )

  // 各地点を囲む最小の長方形（bounding box）を作り、その中心に一番近い地点を返す。
  // Ref. https://turfjs.org/docs/#center, https://turfjs.org/docs/#nearestPoint
  return turfNearestPoint(turfCenter(features), features)
}

// 位置参照情報(街区レベル)から住所データを取得する
const getGaikuAddressItems = async (prefCode, postalCodeKanaItems, postalCodeRomeItems, records) => {
  const outPath = path.join(dataDir, `nlftp_mlit_180a_${prefCode}.csv`)

  while (!fs.existsSync(outPath)) {
    console.log(`${prefCode}: waiting for nlftp_mlit_180a_${prefCode}.csv...`)
    await sleep(1000)
  }

  const text = await fs.promises.readFile(outPath)

  const data = csvParse(text, {
    columns: true,
    skip_empty_lines: true,
  })

  const bar = new cliProgress.SingleBar()
  bar.start(data.length, 0)

  // 緯度・経度をいったん全部coordsに格納する
  // 街区も一緒に書き出したいので、これはこのスコープの gaikuRecords に格納する
  const gaikuRecords = []
  for (let index = 0; index < data.length; index++) {
    const line = data[index]
    const renameEntry =
      isjRenames.find(
        ({ pref, orig }) =>
        (pref === line['都道府県名'] &&
          orig === line['市区町村名']))
    const cityName = renameEntry ? renameEntry.renamed : line['市区町村名']

    // 重複チェックに使用するためのキーには、「大字」または「字」を含めない。
    const townName = removeUnnecessarySpace(line['大字・丁目名'])
    const koazaName = line['小字・通称名'] === 'NULL' ? '' : line['小字・通称名']
    const recordKey = createRecordKey(line['都道府県名'], cityName, townName, koazaName)
    const lng = Number(line['経度'])
    const lat = Number(line['緯度'])
    addToCoords(recordKey, lng, lat)

    if (line['住居表示フラグ'] === '1') {
      const gaikuNum = line['街区符号・地番']
      gaikuRecords.push([line['都道府県名'], cityName, line['大字・丁目名'], gaikuNum, lng, lat])
    }
  }

  const dataLength = data.length
  for (let index = 0; index < dataLength; index++) {
    const line = data[index]

    bar.update(index + 1)

    const renameEntry =
      isjRenames.find(
        ({ pref, orig }) =>
        (pref === line['都道府県名'] &&
          orig === line['市区町村名']))
    const cityName = renameEntry ? renameEntry.renamed : line['市区町村名']
    const townName = removeUnnecessarySpace(line['大字・丁目名'])
    const koazaName = line['小字・通称名'] === 'NULL' ? '' : line['小字・通称名']
    const recordKey = createRecordKey(line['都道府県名'], cityName, townName, koazaName)

    // to avoid duplication
    if (records[recordKey]) {
      continue
    }

    const postalCodeKanaItem = getPostalKanaOrRomeItems(
      line['都道府県名'], cityName, townName, postalCodeKanaItems, '市区町村名カナ', 'kana',
    )
    const postalCodeRomeItem = getPostalKanaOrRomeItems(
      line['都道府県名'], cityName, townName, postalCodeRomeItems, '市区町村名ローマ字', 'rome',
    )

    const center = getCenter(recordKey)
    const record = [
      prefCode,
      postalCodeKanaItem['郵便番号'],
      line['都道府県名'],
      postalCodeKanaItem
        ? han2zen(postalCodeKanaItem['都道府県名カナ'])
        : '',
      postalCodeRomeItem
        ? postalCodeRomeItem['都道府県名ローマ字']
        : '',
      postalCodeKanaItem['全国地方公共団体コード'],
      cityName,
      postalCodeKanaItem
        ? han2zen(postalCodeKanaItem['市区町村名カナ'])
        : '',
      postalCodeRomeItem
        ? postalCodeRomeItem['市区町村名ローマ字']
        : '',
      townName,
      postalCodeKanaItem
        ? han2zen(removeStringEnclosedInParentheses(postalCodeKanaItem['町域名カナ'])) + (getChomeNumber(townName) !== '' ? ` ${getChomeNumber(townName)}` : '')
        : '',
      postalCodeRomeItem
        ? removeStringEnclosedInParentheses(postalCodeRomeItem['町域名ローマ字']) + (getChomeNumber(townName) !== '' ? ` ${getChomeNumber(townName)}` : '')
        : '',
      koazaName,
      Number(center.geometry.coordinates[1]),
      Number(center.geometry.coordinates[0]),
    ]

    records[recordKey] = record
  } // line iteration
  bar.stop()

  const gaikuItems = gaikuRecords.map(record => record.join(',') + '\n')

  return { towns: records, gaikuItems }
}

const getAddressItems = async (
  prefCode,
  postalCodeKanaItems,
  postalCodeRomeItems,
  patchData,
) => {
  const prefName = prefNames[parseInt(prefCode, 10) - 1]
  const filteredPostalCodeKanaItems = postalCodeKanaItems.filter(
    item => item['都道府県名'] === prefName,
  )
  const filteredPostalCodeRomeItems = postalCodeRomeItems.filter(
    item => item['都道府県名'] === prefName,
  )

  const oazaData = await getOazaAddressItems(
    prefCode,
    filteredPostalCodeKanaItems,
    filteredPostalCodeRomeItems,
    patchData,
  )

  const { towns, gaikuItems } = await getGaikuAddressItems(
    prefCode,
    filteredPostalCodeKanaItems,
    filteredPostalCodeRomeItems,
    oazaData,
  )

  console.log(`${prefCode}: 大字・町丁目レベル ${Object.values(towns).length}件`)
  console.log(`${prefCode}: 街区レベル ${Object.values(gaikuItems).length}件`)

  return { towns, gaikuItems }
}

const main = async () => {
  db.serialize(() => {
    db.run('drop table if exists addresses')
    db.run('create table addresses(都道府県コード text,郵便番号 text, 都道府県名 text, 都道府県名カナ text, 都道府県名ローマ字 text, 市区町村コード text, 市区町村名 text, 市区町村名カナ text, 市区町村名ローマ字 text, 大字町丁目名 text, 大字町丁目名カナ text, 大字町丁目名ローマ字 text, 小字・通称名 text, 緯度 real, 経度 real)')
  })

  const t0 = performance.now()
  process.stderr.write('郵便番号辞書のダウンロード中...')
  const [
    postalCodeKanaItems,
    postalCodeRomeItems,
  ] = await Promise.all([
    downloadPostalCodeKana(),
    downloadPostalCodeRome(),
  ])
  process.stderr.write('done\n')

  const prefCodeArray = process.argv[2] ? process.argv[2].split(',') : Array.from(Array(47), (v, k) => k + 1)

  const download130bQueue = async.queue(async prefCode => {
    const outPath = path.join(dataDir, `nlftp_mlit_130b_${prefCode}.csv`)

    if (!fs.existsSync(outPath)) {
      await _downloadNlftpMlitFile(prefCode, outPath, '13.0b')
    }
  }, 1)

  const download180aQueue = async.queue(async prefCode => {
    const outPath = path.join(dataDir, `nlftp_mlit_180a_${prefCode}.csv`)

    if (!fs.existsSync(outPath)) {
      await _downloadNlftpMlitFile(prefCode, outPath, '18.0a')
    }
  }, 3)

  prefCodeArray.forEach(prefNumber => {
    const prefCode = toPrefCode(prefNumber)
    download130bQueue.push(prefCode)
    download180aQueue.push(prefCode)
  })

  const gaiku_outfile = await fs.promises.open(path.join(dataDir, 'latest_gaiku.csv'), 'w')

  const sqliteWriterQueue = async.queue(async array => {
    // If no postal code is available, add
      if ((/^\d+$/.test(array[1])) === false) {
          let additions = undefined;
          const district_name_rome = array[10].replace(/\d+$/, '').replaceAll(" ", "")
            .replace("SHINMAEDA","SHIMMAEDA")
            .replace("IYAMAMINAMI","IIYAMAMINAMI")
            .replace("OGISHINMACHIDORI","OGISHIMMACHIDORI")
            .replace("AZANASHINOKI","NASHINOKI")
            .replace("KAMITOBASANOMOTOCHO","KAMITOBAASANOMOTOCHO")
            .replace("SANMAIBASHI","SAMMAIBASHI")
            .replace("TATEOKASHINMACHI","TATEOKASHIMMACHI")
            .replace("HACCHODAI","HATCHODAI")
            .replace("KANAIWAKAMIECHIZENMACHI","KANAIWAKAMIECHIZEMMACHI")
            .replace("KAMITOBAMINAMIWANOMOTOCHO","KAMITOBAMINAMIIWANOMOTOCHO")
            .replace("SHIZUKINIHAMA","SHIZUKINIIHAMA")
            .replace("TONDASHINMACHI","TONDASHIMMACHI")
            .replace("TATEOKASHIMINAMIWANOMOTOCHO","TATEOKASHIMINAMIIWANOMOTOCHO")
            .replace("SENBADORI","SEMBADORI")
            .replace("SHINMATSUYAMA","SHIMMATSUYAMA")
            .replace("SHINMATSUYAMAMINAMI","SHIMMATSUYAMAMINAMI")
            .replace("UCHIHASHINISHI","UCHIHASHINISHI(SONOTA)")
            .replace("JONANMINAMI","JONAMMINAMI")
            .replace("'","");

          const romeItemFindInclude = postalCodeRomeItems.filter(item => item["都道府県名"] === array[1] && item["市区町村名ローマ字"] === array[7] && (district_name_rome === item["町域名ローマ字"].replaceAll(" ", "") || item["町域名ローマ字"]===""));
          if (romeItemFindInclude && romeItemFindInclude.length === 1) {
            additions = romeItemFindInclude[0]
            if (additions["町域名ローマ字"]===""){
              console.warn("Data may be incorrect, need to check manually: " + array);
            }
          }else if (romeItemFindInclude.length === 2){
            additions = romeItemFindInclude[1]
          }else {
            console.log("Unexpected find of array: " + array);
          }
          if (additions){
            array.splice(1, 0, additions["郵便番号"]);
          }else {
            array.splice(1, 0, "");
          }
      }

    db.run('insert into addresses(都道府県コード, 郵便番号, 都道府県名, 都道府県名カナ, 都道府県名ローマ字, 市区町村コード, 市区町村名, 市区町村名カナ, 市区町村名ローマ字, 大字町丁目名, 大字町丁目名カナ, 大字町丁目名ローマ字, 小字・通称名, 緯度, 経度) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...array)
  }, 1)
  const gaiku_outfileWriterQueue = async.queue(async str => {
    await gaiku_outfile.write(str)
  })

  gaiku_outfileWriterQueue.push([
    '"都道府県名"',
    '"市区町村名"',
    '"大字町丁目名"',
    '"街区番号"',
    '"緯度"',
    '"経度"',
  ].join(',') + '\n')

  const patchData = await importPatches()

  for (let i = 0; i < prefCodeArray.length; i++) {
    const prefCode = toPrefCode(prefCodeArray[i])

    const tp0 = performance.now()
    const { towns, gaikuItems } = await getAddressItems(
      prefCode,
      postalCodeKanaItems,
      postalCodeRomeItems,
      patchData,
    )
    const tp1 = performance.now()
    console.log(`${prefCode}: build took ` + (tp1 - tp0) + ' milliseconds.')

    sqliteWriterQueue.push(Object.values(towns))
    gaiku_outfileWriterQueue.push(gaikuItems)
  } // pref loop

  await sqliteWriterQueue.drain()
  await gaiku_outfileWriterQueue.drain()
  await gaiku_outfile.close()

  const t1 = performance.now()
  console.log('build.js took ' + (t1 - t0) + ' milliseconds.')

  db.serialize(async () => {
    let addresses = await sortAddresses(db)
    await exportToCsv(addresses, './data/latest.csv')
  })

  db.close()
}

try {
  fs.mkdirSync(dataDir)
} catch (error) {
  // already exists
}


if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
