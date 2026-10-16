import{F as e,I as t,L as n,M as r,N as i,P as a,R as o,g as s,n as c,o as l,r as u,t as d,x as f}from"./chunks/decorate-CPEGOotR.js";var p=class extends e{constructor(...e){super(...e),this.manuals=[],this.error=``}static getConfigElement(){return document.createElement(`manuals-card-editor`)}static getStubConfig(){return{}}setConfig(e){this.config=e,this.loadedFor=void 0}getCardSize(){return 1+this.manuals.length}filter(){return this.config.device_id?{device_id:this.config.device_id}:this.config.entity?{device_id:this.hass.entities?.[this.config.entity]?.device_id??`-`}:this.config.area?{area_id:this.config.area}:{}}updated(){if(this.missingTarget())return;let e=this.filter(),t=JSON.stringify(e);t!==this.loadedFor&&(this.loadedFor=t,f(this.hass,e).then(e=>{this.manuals=e.sort((e,t)=>e.title.localeCompare(t.title)),this.error=``},e=>this.error=c(`form.error`,this.hass.language,{message:s(e)})))}missingTarget(){if(this.config.device_id===``)return`card.pick_device`;if(this.config.area===``)return`card.pick_area`}render(){let e=this.missingTarget(),t=this.error||(e?c(e,this.hass.language):``);return n`
      <ha-card .header=${this.config.title??c(`card.title`,this.hass.language)}>
        <div class="card-content">
          ${t?n`<p class="empty">${t}</p>`:this.manuals.length===0?n`<p class="empty">${c(`card.empty`,this.hass.language)}</p>`:this.manuals.map(e=>n`
                  <div class="manual">
                    <div class="title">${e.title}</div>
                    ${e.files.length?l(this.hass,e):n`<div class="empty">${c(`card.no_documents`,this.hass.language)}</div>`}
                  </div>
                `)}
        </div>
      </ha-card>
    `}static{this.styles=[u,o`
      .card-content {
        padding: 0 0 var(--ha-space-2, 8px);
      }
      .manual + .manual {
        margin-top: var(--ha-space-2, 8px);
      }
      .title {
        font-weight: var(--ha-font-weight-medium, 500);
        padding: 0 var(--ha-space-4, 16px);
      }
      .empty {
        color: var(--secondary-text-color);
        padding: var(--ha-space-1, 4px) var(--ha-space-4, 16px);
      }
      p.empty {
        margin: 0;
      }
    `]}};d([i({attribute:!1})],p.prototype,`hass`,void 0),d([r()],p.prototype,`config`,void 0),d([r()],p.prototype,`manuals`,void 0),d([r()],p.prototype,`error`,void 0),p=d([a(`manuals-card`)],p);var m=class extends e{constructor(...e){super(...e),this.computeLabel=e=>({mode:this.t(`editor.mode`),device_id:this.t(`editor.device`),area:this.t(`editor.area`),title:this.t(`editor.title`)})[e.name]??e.name}setConfig(e){this.config=e,this.mode??=e.device_id||e.entity?`device`:e.area?`area`:`all`}t(e){return c(e,this.hass.language)}schema(e){return[{name:`mode`,selector:{select:{mode:`list`,options:[{value:`all`,label:this.t(`editor.mode_all`)},{value:`device`,label:this.t(`editor.mode_device`)},{value:`area`,label:this.t(`editor.mode_area`)}]}}},...e===`device`?[{name:`device_id`,selector:{device:{}}}]:[],...e===`area`?[{name:`area`,selector:{area:{}}}]:[],{name:`title`,selector:{text:{}}}]}valueChanged(e){let{mode:t,device_id:n,area:r,title:i}=e.detail.value;this.mode=t;let a={type:this.config.type};t===`device`&&!n&&this.config.entity?a.entity=this.config.entity:t===`device`&&(a.device_id=n??``),t===`area`&&(a.area=r??``),i&&(a.title=i),this.config=a,this.dispatchEvent(new CustomEvent(`config-changed`,{detail:{config:a},bubbles:!0,composed:!0}))}render(){return!this.hass||!this.config?t:n`
      <ha-form
        .hass=${this.hass}
        .data=${{...this.config,mode:this.mode}}
        .schema=${this.schema(this.mode??`all`)}
        .computeLabel=${this.computeLabel}
        @value-changed=${this.valueChanged}
      ></ha-form>
      ${this.config.entity&&!this.config.device_id?n`<p class="help">entity: ${this.config.entity}</p>`:t}
    `}static{this.styles=o`
    .help {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
  `}};d([i({attribute:!1})],m.prototype,`hass`,void 0),d([r()],m.prototype,`config`,void 0),d([r()],m.prototype,`mode`,void 0),m=d([a(`manuals-card-editor`)],m),window.customCards??=[],window.customCards.push({type:`manuals-card`,name:`Manuals`,description:c(`card.description`),preview:!0,documentationURL:`https://github.com/a-legrand/ha-manuals`});export{p as ManualsCard,m as ManualsCardEditor};