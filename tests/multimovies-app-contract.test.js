// Run with VEGA_APP_DIR=/path/to/vega-app. Executes Vega's actual
// ProviderManager with its native/storage/worker boundary mocked, not its
// array validation or provider dispatch. This is not an Android UI test.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const app = process.env.VEGA_APP_DIR;
test('actual Vega ProviderManager accepts the built stream module', {skip:!app}, async () => {
  const source=fs.readFileSync(path.join(app,'src/lib/services/ProviderManager.ts'),'utf8');
  const {code}=esbuild.transformSync(source,{loader:'ts',format:'cjs',target:'es2020'});
  const streamCode=fs.readFileSync(process.env.STREAM_MODULE_PATH || path.join(__dirname,'../dist/multimovies/stream.js'),'utf8');
  const invocations=[];
  const mocks={
    '../sandbox/abort':{throwIfProviderAborted:()=>{}},
    'react-native':{ToastAndroid:{}},
    'axios':{},
    '../providers/headers':{headers:{}},
    './ExtensionManager':{extensionManager:{getProviderModules:()=>({sourceAuthor:'MoonDevil1',modules:{stream:streamCode}})}},
    '../storage/extensionStorage':{}, '../storage/StorageService':{},
    '../storage/sourceTokenStorage':{}, '../utils/helpers':{},
    '../sandbox/protocol':{MAX_STATE_BYTES:262144},
    '../sandbox/providerScope':{providerAuthor:a=>a,providerScopeId:(a,v)=>a+'/'+v},
    '../sandbox/providerCookieJar':{getJarCookieHeader:()=>''},
    '../sandbox/sandboxBridge':{
      setSandboxStateHandler:()=>{},
      sandboxBridge:{invoke:async invocation=>{
        invocations.push(invocation.exportName);
        const exports={};
        vm.runInNewContext(invocation.moduleCode,{exports,module:{exports},URL,console});
        return exports[invocation.exportName]({...invocation.args,providerContext:{}});
      }},
    },
  };
  const exports={}; const module={exports};
  vm.runInNewContext(code,{module,exports,console,require:id=>{
    if(!(id in mocks)) throw Error('Unmocked dependency: '+id);
    return mocks[id];
  }});
  const manager=new module.exports.ProviderManager();
  const result=await manager.getStream({link:'https://cdn.example/video.mp4',type:'movie',providerValue:'multimovies'});
  assert.ok(Array.isArray(result)); assert.equal(result[0].link,'https://cdn.example/video.mp4');
  assert.deepEqual(invocations,['getStream']);
});
