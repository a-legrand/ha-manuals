import{A as e,B as t,C as n,D as r,E as i,F as a,G as o,H as s,I as c,J as ee,K as te,L as l,M as u,N as d,O as f,P as p,R as m,S as h,T as g,U as _,V as v,W as y,X as b,Y as x,Z as S,_ as C,a as w,b as ne,c as T,d as E,f as D,g as O,h as k,i as A,j as re,k as j,l as ie,m as ae,n as M,o as oe,p as se,q as N,r as P,s as F,t as I,u as L,v as R,w as z,x as B,y as V,z as H}from"./chunks/decorate-CPEGOotR.js";var U=(e,t,n)=>(n.configurable=!0,n.enumerable=!0,Reflect.decorate&&typeof t!=`object`&&Object.defineProperty(e,t,n),n);function W(e,t){return(n,r,i)=>{let a=t=>t.renderRoot?.querySelector(e)??null;if(t){let{get:e,set:t}=typeof r==`object`?n:i??(()=>{let e=Symbol();return{get(){return this[e]},set(t){this[e]=t}}})();return U(n,r,{get(){let n=e.call(this);return n===void 0&&(n=a(this),(n!==null||this.hasUpdated)&&t.call(this,n)),n}})}return U(n,r,{get(){return a(this)}})}}var G=e=>Object.values(e.devices).filter(e=>e.entry_type!==`service`&&!e.disabled_by),K=e=>!!(e.manufacturer||e.model),q=e=>new Set(e.flatMap(e=>e.device_ids)),J=class extends a{constructor(...e){super(...e),this.narrow=!1,this.tabs=[],this.manuals=[],this.ignored=new Set,this.filter=``,this.selected=[],this.showIgnored=!1,this.showUnbranded=!1}t(e,t){return M(e,this.hass.language,t)}manualForSameModel(e){return this.manuals.find(t=>r(e,t.brand,t.model)||t.device_ids.some(t=>{let n=this.hass.devices[t];return n&&r(e,n.manufacturer??``,n.model??``)}))}rows(){let e=q(this.manuals);return G(this.hass).filter(t=>!e.has(t.id)).filter(e=>this.showIgnored||!this.ignored.has(e.id)).filter(e=>this.showUnbranded||K(e)).map(e=>{let t=this.manualForSameModel(e);return{id:e.id,name:k(e),area:e.area_id&&this.hass.areas[e.area_id]?.name||this.t(`form.no_area`),manufacturer:e.manufacturer??``,model:e.model??``,ignored:this.ignored.has(e.id),suggestion:t,suggestion_title:t?.title??``}})}columns(){return{name:{title:this.t(`devices.col_device`),main:!0,sortable:!0,filterable:!0,direction:`asc`,grows:!0,flex:2,minWidth:`150px`,extraTemplate:e=>e.ignored?l`<div style="color: var(--secondary-text-color)">${this.t(`devices.ignored`)}</div>`:c},area:{title:this.t(`devices.col_area`),groupable:!0,filterable:!0,sortable:!0,minWidth:`120px`},manufacturer:{title:this.t(`devices.col_manufacturer`),groupable:!0,filterable:!0,sortable:!0,minWidth:`120px`},model:{title:this.t(`devices.col_model`),groupable:!0,filterable:!0,sortable:!0,minWidth:`120px`},suggestion_title:{title:this.t(`devices.col_suggestion`),filterable:!0,sortable:!0,hidden:this.narrow,minWidth:`300px`,template:e=>e.suggestion?l`<ha-button
                appearance="plain"
                size="s"
                @click=${t=>{t.stopPropagation(),this.link(e.suggestion,[e.id])}}
              >
                <ha-svg-icon slot="start" .path=${o}></ha-svg-icon>
                ${this.t(`devices.link_to`,{title:e.suggestion.title})}
              </ha-button>`:`—`},actions:{title:``,label:this.t(`devices.col_actions`),type:`overflow-menu`,showNarrow:!0,lastFixed:!0,template:e=>l`
          <ha-icon-overflow-menu
            narrow
            .hass=${this.hass}
            .items=${[...e.suggestion?[{path:o,label:this.t(`devices.link_to`,{title:e.suggestion.title}),action:()=>this.link(e.suggestion,[e.id])}]:[],{path:x,label:this.t(`devices.add_manual`),action:()=>this.addManual([e.id])},{path:N,label:this.t(`devices.open_device`),action:()=>z(`/config/devices/device/${e.id}`)},e.ignored?{path:s,label:this.t(`devices.unignore`),action:()=>this.setIgnored([e.id],!1)}:{path:_,label:this.t(`devices.ignore`),action:()=>this.setIgnored([e.id],!0)}]}
          ></ha-icon-overflow-menu>
        `}}}async link(t,n){await this.run(()=>e(this.hass,t.id,{device_ids:[...new Set([...t.device_ids,...n])]}))}async setIgnored(e,t){await this.run(async()=>{for(let n of e)await f(this.hass,n,t)})}async run(e){try{await e()}catch(e){j(this,this.t(`form.error`,{message:O(e)}))}this.changed()}addManual(e){this.dispatchEvent(new CustomEvent(`add-manual`,{detail:e,bubbles:!0,composed:!0}))}changed(){this.dispatchEvent(new CustomEvent(`manuals-changed`,{bubbles:!0,composed:!0}))}commonSuggestion(e){let t=e.filter(e=>this.selected.includes(e.id)),n=t[0]?.suggestion;return n&&t.every(e=>e.suggestion?.id===n.id)?n:void 0}render(){let e=this.rows(),t=this.commonSuggestion(e),n=e.filter(e=>this.selected.includes(e.id)&&e.ignored).length;return l`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .tabs=${this.tabs}
        main-page
        .columns=${this.columns()}
        .data=${e}
        .filter=${this.filter}
        .searchLabel=${this.t(`devices.search`,{count:String(e.length)})}
        .noDataText=${this.t(`devices.empty`)}
        .initialGroupColumn=${`area`}
        .initialSorting=${{column:`name`,direction:`asc`}}
        selectable
        .selected=${this.selected.length}
        clickable
        has-fab
        @search-changed=${e=>this.filter=e.detail.value}
        @selection-changed=${e=>this.selected=e.detail.value}
        @row-click=${e=>this.addManual([e.detail.id])}
      >
        ${this.renderDisplayMenu()}

        <ha-assist-chip
          slot="selection-bar"
          .label=${this.t(`devices.add_manual`)}
          @click=${()=>this.addManual(this.selected)}
        >
          <ha-svg-icon slot="icon" .path=${x}></ha-svg-icon>
        </ha-assist-chip>
        ${t?l`<ha-assist-chip
              slot="selection-bar"
              .label=${this.t(`devices.link_to`,{title:t.title})}
              @click=${()=>this.link(t,this.selected)}
            >
              <ha-svg-icon slot="icon" .path=${o}></ha-svg-icon>
            </ha-assist-chip>`:c}
        <ha-assist-chip
          slot="selection-bar"
          .label=${this.t(n?`devices.unignore`:`devices.ignore`)}
          @click=${()=>this.setIgnored(this.selected,!n)}
        >
          <ha-svg-icon slot="icon" .path=${n?s:_}></ha-svg-icon>
        </ha-assist-chip>

        <ha-button slot="fab" size="l" @click=${()=>this.addManual([])}>
          <ha-svg-icon slot="start" .path=${x}></ha-svg-icon>
          ${this.t(`panel.add`)}
        </ha-button>
      </hass-tabs-subpage-data-table>
    `}renderDisplayMenu(){let e=this.showIgnored||this.showUnbranded;return l`
      <ha-dropdown
        slot="toolbar-icon"
        @wa-select=${e=>{e.detail.item.value===`ignored`&&(this.showIgnored=!this.showIgnored),e.detail.item.value===`unbranded`&&(this.showUnbranded=!this.showUnbranded)}}
      >
        <ha-icon-button
          slot="trigger"
          class=${e?`active`:``}
          .path=${y}
          .label=${this.t(`devices.display`)}
        ></ha-icon-button>
        <ha-dropdown-item type="checkbox" value="ignored" .checked=${this.showIgnored}>
          ${this.t(`devices.show_ignored`,{count:String(this.ignored.size)})}
        </ha-dropdown-item>
        <ha-dropdown-item type="checkbox" value="unbranded" .checked=${this.showUnbranded}>
          ${this.t(`devices.show_unbranded`)}
        </ha-dropdown-item>
      </ha-dropdown>
    `}static{this.styles=m`
    :host {
      display: block;
      height: 100%;
    }
    hass-tabs-subpage-data-table {
      height: 100%;
    }
    ha-icon-button.active {
      color: var(--primary-color);
    }
  `}};I([d({attribute:!1})],J.prototype,`hass`,void 0),I([d({type:Boolean})],J.prototype,`narrow`,void 0),I([d({attribute:!1})],J.prototype,`route`,void 0),I([d({attribute:!1})],J.prototype,`tabs`,void 0),I([d({attribute:!1})],J.prototype,`manuals`,void 0),I([d({attribute:!1})],J.prototype,`ignored`,void 0),I([u()],J.prototype,`filter`,void 0),I([u()],J.prototype,`selected`,void 0),I([u()],J.prototype,`showIgnored`,void 0),I([u()],J.prototype,`showUnbranded`,void 0),J=I([p(`missing-devices`)],J);var Y={title:``,brand:``,model:``,tags:``,notes:``},ce=e=>{let{pathname:t,host:n}=new URL(e);return decodeURIComponent(t.split(`/`).filter(Boolean).pop()??``)||n},X=class extends a{constructor(...e){super(...e),this.opened=!1,this.confirmDelete=!1,this.manual=null,this.draft=Y,this.autoFilled=new Set,this.deviceIds=[],this.areaIds=[],this.pendingFiles=[],this.pendingLinks=[],this.copyFileIds=new Set,this.linkInput=``,this.linkError=``,this.removedFileIds=new Set,this.saving=!1,this.error=``,this.initialState=``}open(e,t=[]){this.manual=e,this.draft=e?{title:e.title,brand:e.brand,model:e.model,tags:e.tags.join(`, `),notes:e.notes}:Y,this.autoFilled=new Set,this.deviceIds=[...e?.device_ids??[]],this.areaIds=[...e?.area_ids??[]],this.pendingFiles=[],this.pendingLinks=[],this.copyFileIds=new Set,this.linkInput=``,this.linkError=``,this.removedFileIds=new Set,this.error=``,this.confirmDelete=!1,!e&&t.length&&this.setDevices(t),this.initialState=this.formState(),this.opened=!0}formState(){return JSON.stringify([this.draft,this.deviceIds,this.areaIds,this.pendingFiles.length,this.pendingLinks.length,[...this.copyFileIds],[...this.removedFileIds]])}t(e,t){return M(e,this.hass.language,t)}close(){this.opened=!1}setField(e){return t=>{let n=t.detail?.value??t.target.value??``;this.draft={...this.draft,[e]:n},this.autoFilled.has(e)&&(this.autoFilled=new Set([...this.autoFilled].filter(t=>t!==e)))}}setDevices(e){this.deviceIds=e,this.manual||this.prefill()}prefill(){let e=this.hass.devices[this.deviceIds[0]],t=e?{brand:e.manufacturer??``,model:e.model??``,title:[e.manufacturer,e.model].filter(Boolean).join(` `)||k(e)}:{brand:``,model:``,title:``},n={...this.draft},r=new Set(this.autoFilled);for(let[e,i]of Object.entries(t))(!n[e]||r.has(e))&&(n[e]=i,i?r.add(e):r.delete(e));this.draft=n,this.autoFilled=r}similarDevices(){let e=this.deviceIds.map(e=>this.hass.devices[e]).filter(Boolean);return Object.values(this.hass.devices).filter(t=>!this.deviceIds.includes(t.id)&&e.some(e=>r(t,e.manufacturer??``,e.model??``)))}async save(){let t=this.draft.title.trim();if(!t){this.error=this.t(`form.title_required`);return}let n={title:t,brand:this.draft.brand.trim(),model:this.draft.model.trim(),tags:this.draft.tags.split(`,`).map(e=>e.trim()).filter(Boolean),notes:this.draft.notes,device_ids:this.deviceIds,area_ids:this.areaIds};this.saving=!0,this.error=``;try{this.manual=this.manual?await e(this.hass,this.manual.id,n):await se(this.hass,n);let t=this.manual.id;for(let e of this.removedFileIds)await i(this.hass,t,e),this.removedFileIds=new Set([...this.removedFileIds].filter(t=>t!==e));for(;this.pendingFiles.length;)await re(this.hass,t,this.pendingFiles[0]),this.pendingFiles=this.pendingFiles.slice(1);for(;this.pendingLinks.length;){let e=this.pendingLinks[0];e.copy?await D(this.hass,t,e.url).catch(t=>{throw this.updateLink(e,{copy:!1}),t}):await E(this.hass,t,e.url),this.pendingLinks=this.pendingLinks.slice(1)}for(let e of this.copyFileIds){let n=this.manual.files.find(t=>t.id===e)?.url;this.copyFileIds=new Set([...this.copyFileIds].filter(t=>t!==e)),n&&(await D(this.hass,t,n),await i(this.hass,t,e))}this.changed(),this.close()}catch(e){this.error=this.errorMessage(e),this.manual&&=(this.changed(),await R(this.hass,this.manual.id).catch(()=>this.manual))}finally{this.saving=!1}}errorMessage(e){let{code:t,message:n,filename:r}=e;if(t===`unsupported_type`)return this.t(`form.upload_unsupported`,{name:r??``});let i={not_document:`form.copy_not_document`,too_large:`form.copy_too_large`,download_failed:`form.copy_failed`};return t&&t in i?this.t(i[t],{message:n??``}):this.t(`form.error`,{message:n??String(e)})}async delete(){if(this.manual){this.saving=!0;try{await ae(this.hass,this.manual.id),this.confirmDelete=!1,this.changed(),this.close()}catch(e){this.confirmDelete=!1,this.error=this.errorMessage(e)}finally{this.saving=!1}}}changed(){this.dispatchEvent(new CustomEvent(`manuals-changed`,{bubbles:!0,composed:!0}))}onFilesPicked(e){let t=e.target;this.pendingFiles=[...this.pendingFiles,...t.files??[]],t.value=``}async addPendingLink(){let e=this.linkInput.trim();if(!e)return;if(!V(e)){this.linkError=this.t(`form.link_invalid`);return}if([...this.pendingLinks.map(e=>e.url),...(this.manual?.files??[]).map(e=>e.url??e.source_url)].includes(e)){this.linkError=this.t(`form.link_duplicate`);return}let t={url:e,copy:!1};this.pendingLinks=[...this.pendingLinks,t],this.linkInput=``,this.linkError=``;let n=await g(this.hass,e).catch(()=>null);this.updateLink(t,{probe:n,copy:!!n?.is_document})}updateLink(e,t){this.pendingLinks=this.pendingLinks.map(n=>n.url===e.url?{...n,...t}:n)}render(){let e=this.similarDevices();return l`
      <ha-dialog
        .hass=${this.hass}
        .open=${this.opened}
        width="large"
        header-title=${this.t(this.manual?`form.edit_title`:`form.new_title`)}
        .preventScrimClose=${this.formState()!==this.initialState}
        @closed=${this.onClosed}
      >
        ${this.error?l`<ha-alert class="error" alert-type="error">${this.error}</ha-alert>`:c}
        <div class="columns">
          <div class="column">
            <h3>${this.t(`form.devices`)}</h3>
            <ha-selector
              .hass=${this.hass}
              .required=${!1}
              .selector=${{device:{multiple:!0}}}
              .value=${this.deviceIds}
              @value-changed=${e=>this.setDevices(e.detail.value??[])}
            ></ha-selector>
            ${e.length?l`<ha-alert alert-type="info">
                  ${this.t(`form.similar`,{names:e.map(k).join(`, `)})}
                  <ha-button
                    slot="action"
                    appearance="plain"
                    size="s"
                    @click=${()=>this.setDevices([...this.deviceIds,...e.map(e=>e.id)])}
                  >
                    ${this.t(`form.similar_add`)}
                  </ha-button>
                </ha-alert>`:c}

            <ha-selector
              .hass=${this.hass}
              .required=${!1}
              .selector=${{area:{multiple:!0}}}
              .value=${this.areaIds}
              .label=${this.t(`form.areas`)}
              @value-changed=${e=>this.areaIds=e.detail.value??[]}
            ></ha-selector>

            <ha-selector
              class="notes"
              .hass=${this.hass}
              .required=${!1}
              .selector=${{text:{multiline:!0}}}
              .value=${this.draft.notes}
              .label=${this.t(`form.notes`)}
              @value-changed=${this.setField(`notes`)}
            ></ha-selector>
          </div>

          <div class="column">
            <h3>${this.t(`form.manual`)}</h3>
            <ha-input
              .label=${this.t(`form.title`)}
              .value=${this.draft.title}
              .validationMessage=${this.t(`form.title_required`)}
              auto-validate
              required
              @input=${this.setField(`title`)}
            ></ha-input>
            <div class="row">
              <ha-input .label=${this.t(`form.brand`)} .value=${this.draft.brand} @input=${this.setField(`brand`)}></ha-input>
              <ha-input .label=${this.t(`form.model`)} .value=${this.draft.model} @input=${this.setField(`model`)}></ha-input>
            </div>

            <ha-input
              .label=${this.t(`form.tags`)}
              .hint=${this.t(`form.tags_help`)}
              .value=${this.draft.tags}
              @input=${this.setField(`tags`)}
            ></ha-input>

            <section>
              <h3>${this.t(`form.files`)}</h3>
              ${this.renderFiles()}
            </section>
          </div>
        </div>

        <ha-dialog-footer slot="footer">
          ${this.manual?l`<ha-button
                slot="secondaryAction"
                class="delete"
                variant="danger"
                appearance="plain"
                .disabled=${this.saving}
                @click=${()=>this.confirmDelete=!0}
              >
                ${this.t(`form.delete`)}
              </ha-button>`:c}
          <ha-button slot="secondaryAction" appearance="plain" @click=${this.close}>
            ${this.t(`form.cancel`)}
          </ha-button>
          <ha-button slot="primaryAction" .loading=${this.saving} @click=${this.save}>
            ${this.t(this.manual?`form.save`:`form.create`)}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>

      <ha-dialog
        .hass=${this.hass}
        .open=${this.confirmDelete}
        type="alert"
        width="small"
        header-title=${this.t(`form.delete_title`)}
        @closed=${e=>e.target===e.currentTarget&&(this.confirmDelete=!1)}
      >
        <p>${this.t(`form.delete_confirm`,{title:this.manual?.title??``})}</p>
        <ha-dialog-footer slot="footer">
          <ha-button slot="secondaryAction" appearance="plain" @click=${()=>this.confirmDelete=!1}>
            ${this.t(`form.cancel`)}
          </ha-button>
          <ha-button slot="primaryAction" variant="danger" .loading=${this.saving} @click=${this.delete}>
            ${this.t(`form.delete`)}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `}onClosed(e){e.target===e.currentTarget&&(this.opened=!1,this.manual=null)}renderFiles(){let e=(this.manual?.files??[]).filter(e=>!this.removedFileIds.has(e.id)),t=e.length||this.pendingFiles.length||this.pendingLinks.length;return l`
      ${t?l`<ha-list-base class="files">
            ${e.map(e=>this.renderExistingFile(e))}
            ${this.pendingFiles.map((e,t)=>l`
                <ha-list-item-base
                  .headline=${e.name}
                  .supportingText=${`${C(e.size,this.hass.language)} · ${this.t(`form.pending`)}`}
                >
                  <ha-svg-icon slot="start" .path=${S}></ha-svg-icon>
                  ${this.removeButton(()=>this.pendingFiles=this.pendingFiles.filter((e,n)=>n!==t))}
                </ha-list-item-base>
              `)}
            ${this.pendingLinks.map((e,t)=>this.renderPendingLink(e,t))}
          </ha-list-base>`:c}

      <div class="add-link">
        <ha-input
          type="url"
          .label=${this.t(`form.link_label`)}
          placeholder="https://…"
          .value=${this.linkInput}
          .invalid=${!!this.linkError}
          .validationMessage=${this.linkError}
          @input=${e=>{this.linkInput=e.target.value??``,this.linkError=``}}
          @keydown=${e=>{e.key===`Enter`&&(e.preventDefault(),this.addPendingLink())}}
        ></ha-input>
        <ha-icon-button
          class="add"
          .path=${x}
          .label=${this.t(`form.add_link`)}
          .disabled=${!this.linkInput.trim()}
          @click=${this.addPendingLink}
        ></ha-icon-button>
      </div>
      ${this.renderWebSearch()}
      <div>
        <ha-button appearance="filled" @click=${this.pickFiles}>
          <ha-svg-icon slot="start" .path=${S}></ha-svg-icon>
          ${this.t(`form.add_files`)}
        </ha-button>
        <input type="file" multiple accept=${ie} @change=${this.onFilesPicked} hidden />
      </div>
    `}pickFiles(){this.renderRoot.querySelector(`input[type=file]`)?.click()}removeButton(e){return l`<ha-icon-button
      slot="end"
      .path=${H}
      .label=${this.t(`form.remove`)}
      @click=${e}
    ></ha-icon-button>`}renderExistingFile(e){let t=this.copyFileIds.has(e.id),n=A(e,this.hass.language);return l`
      <ha-list-item-base
        .headline=${e.filename}
        .supportingText=${t?`${n} · ${this.t(`form.pending_copy`)}`:n}
      >
        <ha-svg-icon slot="start" .path=${F(e)}></ha-svg-icon>
        ${e.url?l`
              <ha-icon-button
                slot="end"
                .path=${N}
                .label=${this.t(`form.open`)}
                href=${e.url}
                target="_blank"
                rel="noopener noreferrer"
              ></ha-icon-button>
              ${t?c:l`<ha-icon-button
                    slot="end"
                    .path=${v}
                    .label=${this.t(`form.copy_existing`)}
                    @click=${()=>this.copyFileIds=new Set([...this.copyFileIds,e.id])}
                  ></ha-icon-button>`}
            `:c}
        ${this.removeButton(()=>this.removedFileIds=new Set([...this.removedFileIds,e.id]))}
      </ha-list-item-base>
    `}renderPendingLink(e,t){let n;return n=e.probe===void 0?this.t(`form.link_checking`):e.probe?e.probe.is_document?[e.probe.content_type===`application/pdf`?`PDF`:this.t(`form.image`),e.probe.size?C(e.probe.size,this.hass.language):``,w(e.url)].filter(Boolean).join(` · `):`${w(e.url)} · ${this.t(`form.link_page`)}`:`${w(e.url)} · ${this.t(`form.link_unreachable`)}`,l`
      <ha-list-item-base .headline=${e.probe?.filename||ce(e.url)} .supportingText=${n}>
        <ha-svg-icon slot="start" .path=${e.copy?v:F({url:e.url})}></ha-svg-icon>
        ${e.probe?.is_document?l`<ha-checkbox
              slot="end"
              .checked=${e.copy}
              @change=${t=>this.updateLink(e,{copy:t.target.checked})}
            >
              ${this.t(`form.copy`)}
            </ha-checkbox>`:c}
        ${this.removeButton(()=>this.pendingLinks=this.pendingLinks.filter((e,n)=>n!==t))}
      </ha-list-item-base>
    `}renderWebSearch(){let e=[this.draft.brand,this.draft.model].map(e=>e.trim()).filter(Boolean).join(` `)||this.draft.title.trim();if(!e)return l`<p class="hint">${this.t(`form.search_web_hint`)}</p>`;let t=h(e,this.hass.language);return l`
      <div class="web-search">
        <span class="hint">${this.t(`form.search_web`)}</span>
        ${L.map(e=>l`
            <ha-button appearance="plain" size="s" href=${e.url(t)} target="_blank" rel="noopener noreferrer">
              ${e.name}
              <ha-svg-icon slot="end" .path=${N}></ha-svg-icon>
            </ha-button>
          `)}
      </div>
    `}static{this.styles=m`
    ha-dialog {
      --ha-dialog-width-lg: 960px;
    }
    /* Two columns on wide screens: devices, areas, notes | details, documents. */
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-6, 24px);
      align-items: start;
      color: var(--primary-text-color);
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4, 16px);
      min-width: 0;
    }
    /* One column on small screens, notes last. */
    @media (max-width: 800px) {
      .columns {
        grid-template-columns: 1fr;
        gap: var(--ha-space-4, 16px);
      }
      .column {
        display: contents;
      }
      .notes {
        order: 1;
      }
    }
    /* Destructive action on the left, away from Cancel / Save. */
    ha-button.delete {
      margin-inline-end: auto;
    }
    ha-alert.error {
      display: block;
      margin-bottom: var(--ha-space-4, 16px);
    }
    ha-selector,
    ha-input {
      display: block;
    }
    .row {
      display: flex;
      gap: var(--ha-space-4, 16px);
    }
    .row ha-input {
      flex: 1;
      min-width: 0;
    }
    @media (max-width: 600px) {
      .row {
        flex-wrap: wrap;
      }
      .row ha-input {
        flex: 1 1 100%;
      }
    }
    section {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3, 12px);
    }
    h3 {
      margin: 0;
      font-size: var(--ha-font-size-l, 16px);
      font-weight: var(--ha-font-weight-bold, 600);
    }
    /* Compact rows: the default ones are sized for full-page lists. */
    ha-list-base.files {
      display: block;
      --ha-row-item-padding-block: var(--ha-space-1, 4px);
      --ha-row-item-min-height: 40px;
      --ha-row-item-gap: var(--ha-space-3, 12px);
      --ha-icon-button-size: 36px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg, 12px);
      overflow: hidden;
    }
    ha-list-base.files ha-icon-button {
      color: var(--secondary-text-color);
    }
    .add-link {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-2, 8px);
    }
    .add-link ha-input {
      flex: 1;
    }
    .add-link ha-icon-button.add {
      margin-top: var(--ha-space-1, 4px);
    }
    .web-search {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0 var(--ha-space-1, 4px);
      margin-top: calc(-1 * var(--ha-space-2, 8px));
    }
    .hint {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
  `}};I([d({attribute:!1})],X.prototype,`hass`,void 0),I([u()],X.prototype,`opened`,void 0),I([u()],X.prototype,`confirmDelete`,void 0),I([u()],X.prototype,`manual`,void 0),I([u()],X.prototype,`draft`,void 0),I([u()],X.prototype,`autoFilled`,void 0),I([u()],X.prototype,`deviceIds`,void 0),I([u()],X.prototype,`areaIds`,void 0),I([u()],X.prototype,`pendingFiles`,void 0),I([u()],X.prototype,`pendingLinks`,void 0),I([u()],X.prototype,`copyFileIds`,void 0),I([u()],X.prototype,`linkInput`,void 0),I([u()],X.prototype,`linkError`,void 0),I([u()],X.prototype,`removedFileIds`,void 0),I([u()],X.prototype,`saving`,void 0),I([u()],X.prototype,`error`,void 0),X=I([p(`manual-dialog`)],X);var Z=`/list`,Q=`/devices`,$=class extends a{constructor(...e){super(...e),this.narrow=!1,this.ready=!1,this.manuals=[],this.query=``,this.areaId=``,this.allManuals=[],this.ignored=new Set}async firstUpdated(){await T(),this.ready=!0,this.refresh()}t(e,t){return M(e,this.hass.language,t)}get isAdmin(){return this.hass.user?.is_admin??!1}get onDevicesTab(){return this.isAdmin&&this.route?.path===Q}async refresh(){let e={};this.query&&(e.query=this.query),this.areaId&&(e.area_id=this.areaId);let t,n,r;try{[t,n,r]=await Promise.all([B(this.hass,e),B(this.hass),this.isAdmin?ne(this.hass):Promise.resolve([])])}catch(e){j(this,this.t(`form.error`,{message:O(e)}));return}this.manuals=t.sort((e,t)=>e.title.localeCompare(t.title)),this.allManuals=n,this.ignored=new Set(r)}missingCount(){let e=q(this.allManuals);return G(this.hass).filter(t=>!e.has(t.id)&&!this.ignored.has(t.id)&&K(t)).length}onSearch(e){this.query=e.target.value??``,clearTimeout(this.searchTimer),this.searchTimer=window.setTimeout(()=>this.refresh(),250)}onArea(e){this.areaId=e.detail.item.value,this.refresh()}renderSearch(){return l`<ha-input-search
      appearance="outlined"
      .value=${this.query}
      .placeholder=${this.t(`panel.search`)}
      @input=${this.onSearch}
    ></ha-input-search>`}renderAreaFilter(){let e=Object.values(this.hass.areas).sort((e,t)=>e.name.localeCompare(t.name)),t=this.hass.areas[this.areaId];return l`
      <ha-dropdown @wa-select=${this.onArea}>
        ${this.narrow?l`<ha-icon-button
              slot="trigger"
              class=${t?`active`:``}
              .path=${y}
              .label=${t?.name??this.t(`panel.all_areas`)}
            ></ha-icon-button>`:l`<ha-button slot="trigger" appearance="plain" size="s" variant=${t?`brand`:`neutral`}>
              <ha-svg-icon slot="start" .path=${y}></ha-svg-icon>
              ${t?.name??this.t(`panel.all_areas`)}
              <ha-svg-icon slot="end" .path=${te}></ha-svg-icon>
            </ha-button>`}
        <ha-dropdown-item value="" .selected=${!t}>${this.t(`panel.all_areas`)}</ha-dropdown-item>
        <wa-divider></wa-divider>
        ${e.map(e=>l`<ha-dropdown-item value=${e.area_id} .selected=${e.area_id===this.areaId}>
            ${e.icon?l`<ha-icon slot="icon" .icon=${e.icon}></ha-icon>`:l`<ha-svg-icon slot="icon" .path=${b}></ha-svg-icon>`}
            ${e.name}
          </ha-dropdown-item>`)}
      </ha-dropdown>
    `}render(){if(!this.ready)return c;let e=this.route?.prefix??`/manuals`,t=[{path:e+Z,name:`${this.t(`panel.tab_manuals`)} (${this.allManuals.length})`},...this.isAdmin?[{path:e+Q,name:`${this.t(`panel.tab_devices`)} (${this.missingCount()})`}]:[]],n={prefix:e,path:this.onDevicesTab?Q:Z},r=l`<manual-dialog .hass=${this.hass} @manuals-changed=${this.refresh}></manual-dialog>`;return this.onDevicesTab?l`
        <missing-devices
          .hass=${this.hass}
          .narrow=${this.narrow}
          .route=${n}
          .tabs=${t}
          .manuals=${this.allManuals}
          .ignored=${this.ignored}
          @add-manual=${e=>this.dialog.open(null,e.detail)}
          @manuals-changed=${this.refresh}
        ></missing-devices>
        ${r}
      `:l`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${n}
        .tabs=${t}
        main-page
        ?has-fab=${this.isAdmin}
      >
        ${this.narrow?l`<div slot="header" class="header">${this.renderSearch()}</div>
              <div slot="toolbar-icon">${this.renderAreaFilter()}</div>`:l`<div class="search">${this.renderSearch()} ${this.renderAreaFilter()}</div>`}
        ${this.manuals.length===0?l`<p class="empty">${this.t(`panel.empty`)}</p>`:l`<div class="grid">${this.manuals.map(e=>this.renderManual(e))}</div>`}
        ${this.isAdmin?l`<ha-button slot="fab" size="l" @click=${()=>this.dialog.open(null)}>
              <ha-svg-icon slot="start" .path=${x}></ha-svg-icon>
              ${this.t(`panel.add`)}
            </ha-button>`:c}
      </hass-tabs-subpage>
      ${r}
    `}renderManual(e){let r=e.device_ids.map(e=>this.hass.devices[e]).filter(Boolean),i=e.area_ids.map(e=>this.hass.areas[e]).filter(Boolean),a=[...r.map(e=>({icon:t,name:k(e),path:`/config/devices/device/${e.id}`})),...i.map(e=>({icon:b,name:e.name,path:`/config/areas/area/${e.area_id}`}))];return l`
      <ha-card outlined>
        <div class="card-header">
          <div class="title">
            <span class="name">${e.title}</span>
            ${e.brand||e.model?l`<span class="secondary">${[e.brand,e.model].filter(Boolean).join(` · `)}</span>`:c}
          </div>
          ${this.isAdmin?l`<ha-icon-button
                .path=${ee}
                .label=${this.t(`panel.edit`)}
                @click=${()=>this.dialog.open(e)}
              ></ha-icon-button>`:c}
        </div>
        ${a.length||e.tags.length?l`<div class="linked">
              ${a.map(e=>l`<a
                    class="link ${this.isAdmin?``:`disabled`}"
                    href=${this.isAdmin?e.path:c}
                    @click=${t=>this.isAdmin&&n(t,e.path)}
                  >
                    <ha-svg-icon .path=${e.icon}></ha-svg-icon>${e.name}
                  </a>`)}
              ${e.tags.map(e=>l`<span class="tag">#${e}</span>`)}
            </div>`:c}
        ${oe(this.hass,e)}
      </ha-card>
    `}static{this.styles=[P,m`
      :host {
        display: block;
        height: 100%;
        background-color: var(--primary-background-color);
      }
      hass-tabs-subpage {
        height: 100%;
      }
      .search {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4, 16px);
        height: 56px;
        padding: 0 var(--ha-space-4, 16px);
        position: sticky;
        top: 0;
        z-index: 2;
        box-sizing: border-box;
        background-color: var(--primary-background-color);
        border-bottom: 1px solid var(--divider-color);
      }
      .header {
        display: flex;
        min-width: 0;
      }
      ha-input-search {
        flex: 1;
        min-width: 0;
      }
      ha-icon-button.active {
        color: var(--primary-color);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: var(--ha-space-4, 16px);
        padding: var(--ha-space-4, 16px);
        max-width: 1600px;
        margin: 0 auto;
      }
      .empty {
        text-align: center;
        color: var(--secondary-text-color);
        padding: var(--ha-space-8, 32px) var(--ha-space-4, 16px);
      }
      ha-card {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--ha-space-2, 8px);
        padding: var(--ha-space-3, 12px) var(--ha-space-2, 8px) 0 var(--ha-space-4, 16px);
      }
      .title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding-top: var(--ha-space-2, 8px);
      }
      .name {
        font-size: var(--ha-font-size-l, 16px);
        font-weight: var(--ha-font-weight-medium, 500);
        line-height: var(--ha-line-height-condensed, 1.2);
        overflow-wrap: anywhere;
      }
      .secondary {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-m, 14px);
        margin-top: var(--ha-space-1, 4px);
      }
      .linked {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1, 4px) var(--ha-space-3, 12px);
        padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px) 0;
        font-size: var(--ha-font-size-m, 14px);
      }
      .link {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1, 4px);
        color: var(--primary-color);
        text-decoration: none;
        --mdc-icon-size: 18px;
      }
      .link.disabled {
        color: var(--secondary-text-color);
      }
      .tag {
        color: var(--secondary-text-color);
      }
      ha-list-base.documents {
        padding: var(--ha-space-2, 8px) 0;
      }
    `]}};I([d({attribute:!1})],$.prototype,`hass`,void 0),I([d({type:Boolean})],$.prototype,`narrow`,void 0),I([d({attribute:!1})],$.prototype,`route`,void 0),I([u()],$.prototype,`ready`,void 0),I([u()],$.prototype,`manuals`,void 0),I([u()],$.prototype,`query`,void 0),I([u()],$.prototype,`areaId`,void 0),I([u()],$.prototype,`allManuals`,void 0),I([u()],$.prototype,`ignored`,void 0),I([W(`manual-dialog`)],$.prototype,`dialog`,void 0),$=I([p(`manuals-panel`)],$);export{$ as ManualsPanel};