import { patch as $patch$ } from './monkey-patch'
import { sentenceCase } from './text'
import * as l10n from './l10n'
import { log } from './logger'
import { Elements } from './create-element'
import { busyWait } from './busy-wait'
import { icons } from './icons'
import { is7 } from './client'

async function title_sentenceCase(label) {
  const val = this._getFieldValue(label)
  const newVal = sentenceCase(val)
  this._setFieldValue(label, newVal)
  const fieldName = label.getAttribute('fieldname')
  this._modifyField(fieldName, newVal)
  const isTitle = Zotero.ItemFields.getBaseIDFromTypeAndField(this.item.itemTypeID, fieldName) === Zotero.ItemFields.getID('title')
  const shortTitleVal = this.item.getField('shortTitle')
  if (isTitle && newVal.toLowerCase().startsWith(shortTitleVal.toLowerCase())) {
    this._modifyField('shortTitle', newVal.substr(0, shortTitleVal.length))
  }
  if (this.saveOnEdit) {
    await this.blurOpenField()
    await this.item.saveTx()
  }
}

export async function newZoteroItemPane(win: Window): Promise<void> {
  let itemBox: HTMLElement
  await busyWait(() => { itemBox = win.document.querySelector(is7 ? 'item-box' : '#zotero-editpane-item-box'); return !!itemBox })
  new ZoteroItemPane(win, itemBox)
}

export class ZoteroItemPane {
  document: Document
  elements: Elements

  public refresh(): void {
    this.itemBox.refresh()
  }

  constructor(win: Window, private itemBox: any) { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    this.document = win.document
    const elements = this.elements = new Elements(this.document)
    // const itemPane = (win as any).ZoteroItemPane
    // itemPane.BetterBibTeX = this

    if (!this.document.getElementById('better-bibtex-editpane-item-box')) {
      if (is7) {
        /*
        itemBox.parentNode.parentNode.parentNode.appendChild(elements.create('html:div', { style: 'display: flex; flex-direction: column;' , $: [

          elements.create('html:div', { id: 'better-bibtex-editpane-item-box', style: 'display: flex; flex-direction: row', $: [
            elements.create('label', { id: 'better-bibtex-citekey-label', style: 'flex: 0 0 auto; width: 9em; text-align: right; color: #7F7F7F', value: '' }),
            elements.create('html:input', { id: 'better-bibtex-citekey-display', type: 'text', style: 'flex: 0 0 auto', readonly: 'true', value: '' }),
          ]}),

          itemBox.parentNode.parentNode,
        ]}))
        */
        log.debug('waiting for API to insert citekey in itempane')
      }
      else {
        itemBox.parentNode.appendChild(elements.create('vbox', { flex: 1, style: 'margin: 0; padding: 0', $: [

          elements.create('grid', { id: 'better-bibtex-editpane-item-box', $: [
            elements.create('columns', { $: [
              elements.create('column'),
              elements.create('column'),
              // elements.create('column', { flex: 100 }),
            ]}),
            elements.create('rows', { id: 'better-bibtex-fields', flex: 1, $: [
              elements.create('row', { class: 'zotero-item-first-row', $: [
                elements.create('label', { id: 'better-bibtex-citekey-label', style: 'width: 9em; text-align: right; color: #7F7F7F', value: '' }),
                elements.create('textbox', { id: 'better-bibtex-citekey-display', class: 'plain', readonly: 'true', value: '' }),
                // elements.create('label', { id: 'better-bibtex-citekey-pin', value: icons.pin }),
              ]}),
            ]}),
          ]}),

          itemBox,
        ]}))
      }
    }

    win.addEventListener('unload', () => {
      this.unload()
    })

    $patch$(itemBox.__proto__, 'refresh', original => function() {
      // eslint-disable-next-line prefer-rest-params
      original.apply(this, arguments)

      if (!this.item) {
        // why is it refreshing if there is no item?!
        log.debug('itemBox.refresh without an item')
        return
      }

      if (!is7) {
        const menuid = 'zotero-field-transform-menu-better-sentencecase'
        let menuitem = this.ownerDocument.getElementById(menuid)
        const menu = this.ownerDocument.getElementById('zotero-field-transform-menu')
        if (menu && !menuitem) {
          log.debug('bbt sentencecase: adding', menuid)
          menuitem = menu.appendChild(elements.create('menuitem', {
            id: menuid,
            label: 'BBT sentence case',
            oncommand: event => {
              title_sentenceCase.call(event.currentTarget.ownerDocument.getBindingParent(event.currentTarget), event.currentTarget.ownerDocument.popupNode)
            },
          }))
        }
      }

      const { citationKey, pinned } = Zotero.BetterBibTeX.KeyManager.get(this.item.id)
      const label = this.parentNode.querySelector('#better-bibtex-citekey-label')
      const value = this.parentNode.querySelector('#better-bibtex-citekey-display')
      if (!value) return // merge pane uses itembox

      label.hidden = value.hidden = !citationKey

      label.value = `${pinned ? icons.pin : ''}${l10n.localize('better-bibtex_item-pane_citekey')}`
      value.value = citationKey
    })
  }

  public unload(): void {
    this.elements.remove()
  }
}
