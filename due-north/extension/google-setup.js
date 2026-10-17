'use strict';
if(globalThis.chrome?.runtime?.id)document.getElementById('extension-id').textContent=chrome.runtime.id;
