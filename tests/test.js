const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../builds/streamclean/index.js'), 'utf8');
const store = {};
const patches = [];
const patcher = { before(key,obj,cb) {
  const previous = obj[key];
  obj[key] = function(...args) { const modified = cb(args) || args; return previous.apply(this, modified); };
  const undo = () => { obj[key] = previous; };
  patches.push(undo);
  return undo;
}};
const jsx = { jsx(type, props) { return {type,props}; }, jsxs(type,props) {return {type,props};} };
const React = { createElement(type,props,...children){return {type,props,children};} };
const Native = { Text:'Text', ScrollView:'ScrollView' };
const nativePayload = {create:function(a,b){return a}, diff:function(a,b,c){return b}};
const ctx = {
  bunny: {
    api:{patcher,storage:{useProxy(){}}},
    plugin:{createStorage:()=>store, logger:{log(){},warn(){}}},
    metro:{common:{ React, ReactNative:Native, clipboard:{setString(s){ctx.copied=s}}},
      findByPropsAll:(...names)=>names.includes('create')?[nativePayload]:[jsx]},
    ui:{components:{Forms:{FormSwitchRow:'FormSwitchRow',FormRow:'FormRow',FormDivider:'FormDivider'}},toasts:{showToast(){}}}
  },
  console
};
vm.createContext(ctx);
vm.runInContext(src,ctx);
assert(ctx.plugin, 'plugin export missing');
ctx.plugin.start();
const gradient = {displayName:'LinearGradient'};
const colors = ['rgba(0,0,0,0.8)','rgba(0,0,0,0)'];
const g = jsx.jsx(gradient,{colors,style:{position:'absolute',top:0}});
assert(g.props.colors.every(x=>x === 'rgba(0,0,0,0)'), 'gradient not removed');
assert.deepStrictEqual(colors,['rgba(0,0,0,0.8)','rgba(0,0,0,0)'],'original mutated');
const unrelated=jsx.jsx('Text',{colors:['red','green'],style:{borderRadius:12}});
assert.strictEqual(unrelated.props.style.borderRadius,12,'unrelated UI modified');
const video = jsx.jsxs({displayName:'VideoRenderer'},{style:{borderTopLeftRadius:20,borderBottomRightRadius:15}});
assert.strictEqual(video.props.style.borderTopLeftRadius,0);
assert.strictEqual(video.props.style.borderBottomRightRadius,0);
const image=jsx.jsx('Image',{style:{borderRadius:12}});
assert.strictEqual(image.props.style.borderRadius,12);
const native=nativePayload.create({nativeID:'stream-player-video',style:{borderRadius:16}},{});
assert.strictEqual(native.style.borderRadius,0);
ctx.plugin.SettingsComponent();
// Exercise diagnostic action via mocked render tree.
const settings=ctx.plugin.SettingsComponent();
const children=settings.children;
const copy=children.filter(x=>x?.props?.label === 'Copy diagnostics')[0];
copy.props.onPress();
assert(ctx.copied.includes('dark gradients seen=1'));
store.removeGradients = false;
const g2=jsx.jsx(gradient,{colors});
assert.strictEqual(g2.props.colors,colors,'disabled should preserve original');
ctx.plugin.stop();
const after=jsx.jsx(gradient,{colors});
assert.strictEqual(after.props.colors,colors, 'stop did not restore original hook');
console.log('PASS: package loads; hooks; safe selective gradient; radius; native; settings diagnostics; toggle; unpatch');
