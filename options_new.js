(async function(){
    const els = {
        autoAct: document.getElementById('autoAct'),
        apiBase: document.getElementById('apiBase'),
        save: document.getElementById('save'),
        msg: document.getElementById('msg')
    };
    const cfg = await chrome.storage.sync.get({ autoAct:true, apiBase:'' });
    els.autoAct.checked = cfg.autoAct; 
    els.apiBase.value = cfg.apiBase;
    els.save.onclick = async ()=>{
        await chrome.storage.sync.set({ autoAct: els.autoAct.checked, apiBase: els.apiBase.value.trim() });
        els.msg.textContent = 'Saved'; 
        setTimeout(()=>els.msg.textContent='', 1500);
    };
})();
