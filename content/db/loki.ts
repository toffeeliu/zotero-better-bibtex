/* eslint-disable @typescript-eslint/explicit-module-boundary-types, prefer-arrow/prefer-arrow-functions, prefer-rest-params, @typescript-eslint/no-unsafe-return */

// Components.utils.import('resource://gre/modules/Sqlite.jsm')
// declare const Sqlite: any

import { patch as $patch$ } from '../monkey-patch'
import { Preference } from '../prefs'
import { alert } from '../prompt'
import { Events } from '../events'

import { log } from '../logger'
// import { Preferences as Prefs } from '../prefs'

// eslint-disable-next-line @typescript-eslint/naming-convention,no-underscore-dangle,id-blacklist,id-match
import Loki = require('lokijs')

import { validator, coercing } from '../ajv'

// 894
$patch$(Loki.Collection.prototype, 'findOne', original => function() {
  if (!this.data.length) return null

  return original.apply(this, arguments)
})

function oops(collection, action, doc, errors) {
  log.debug(collection, action, doc)
  if (!errors) return

  const error = new Error(`${collection} ${action} ${JSON.stringify(doc)}: ${errors}`)
  Preference.scrubDatabase = true
  log.error(error)
  alert({ text: `Better BibTeX: error ${action} ${collection}, restart to repair` })
  throw error
}

$patch$(Loki.Collection.prototype, 'insert', original => function(doc) {
  oops(this.name, 'inserting', doc, this.validationError?.(doc))
  return original.apply(this, arguments)
})

$patch$(Loki.Collection.prototype, 'update', original => function(doc) {
  oops(this.name, 'updating', doc, this.validationError?.(doc))
  return original.apply(this, arguments)
})

// TODO: workaround for https://github.com/techfort/LokiJS/issues/595#issuecomment-322032656
$patch$(Loki.prototype, 'close', original => function(callback) {
  const store: string = this.persistenceAdapter.constructor.name || 'Unknown'
  Zotero.debug(`BBT: patched ${store}.close started`)
  return original.call(this, errClose => {
    Zotero.debug(`BBT: patched ${store}.close has ran: ${errClose}`)
    if (this.persistenceAdapter && (typeof this.persistenceAdapter.close === 'function')) {
      Zotero.debug(`BBT: patched ${store}.persistenceAdapter.close started`)
      this.persistenceAdapter.close(this.filename, errCloseAdapter => {
        Zotero.debug(`BBT: patched ${store}.persistenceAdapter.close finished: ${errClose || errCloseAdapter}`)
        callback(errClose || errCloseAdapter)
      })
    }
    else {
      callback(errClose)
    }
  })
})

class NullStore {
  public mode = 'reference'

  public exportDatabase(name, dbref, callback) { return callback(null) }
  public loadDatabase(name, callback) { return callback(null) }
}

const autoSaveOnIdle = []
Events.addIdleListener('save-database', 5)
Events.on('idle', async state => {
  if (state.topic !== 'save-database' || state.state !== 'idle') return

  for (const db of autoSaveOnIdle) {
    if (!db.autosaveDirty()) continue

    try {
      await db.saveDatabase()
    }
    catch (err) {
      log.error('idle, saving failed', db.filename, err)
    }
  }
})

// https://github.com/Microsoft/TypeScript/issues/17032
export class XULoki extends Loki {
  constructor(name: string, options: any = {}) {
    // const nullStore = !options.adapter
    options.adapter = options.adapter || new NullStore()
    options.env = 'XUL-Chrome'

    const periodicSave = options.autosaveInterval
    if (periodicSave) options.autosave = true

    super(name, options)

    if (periodicSave) {
      autoSaveOnIdle.push(this)
    }
    else {
      // workaround for https://github.com/techfort/LokiJS/issues/597
      this.autosaveDisable()
    }
  }

  public loadDatabase(options = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      super.loadDatabase(options, err => {
        if (err) return reject(err)
        resolve(null)
      })
    })
  }

  public saveDatabase(): Promise<void> {
    // const store = this.persistenceAdapter.constructor.name
    return new Promise((resolve, reject) => {
      super.saveDatabase(err => {
        if (err) {
          reject(err)
        }
        else {
          resolve(null)
        }
      })
    })
  }

  public close(): Promise<void> {
    const store = this.persistenceAdapter.constructor.name
    Zotero.debug(`BBT: ${store}.closeAsync started`)
    return new Promise((resolve, reject) => {
      super.close(err => {
        if (err) {
          reject(err)
        }
        else {
          resolve(null)
        }
      })
    })
  }

  public schemaCollection(name: string, options: any) {
    options.cloneObjects = true
    options.clone = true
    const coll: any = this.getCollection(name) || this.addCollection(name, options)
    coll.cloneObjects = true

    coll.validationError = validator(options.schema, coercing)

    return coll
  }
}

type QueryPrimitive = number | boolean | string | undefined
export type Query
  = { [field: string]: { $eq: QueryPrimitive } }
  | { [field: string]: { $ne: QueryPrimitive } }
  | { [field: string]: { $in: QueryPrimitive[] } }
  | { $and: Query[] }

export function $and(query): Query {
  let and: Query = { $and: Object.entries(query).map(([k, v]: [string, QueryPrimitive | Query]) => ({ [k]: typeof v === 'object' ? v : {$eq: v } })) as Query[] }
  if (and.$and.length === 1) and = and.$and[0]
  return and
}

