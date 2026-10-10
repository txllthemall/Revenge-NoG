var plugin = (() => {
  'use strict';
  // Revenge Classic / Bunny v3. No networking, telemetry, or remote code.
  const client = typeof bunny !== 'undefined' ? bunny : null;
  if (!client) throw new Error('StreamClean requires Revenge Classic');
  const { metro, api, ui } = client;
  const patcher = api.patcher;
  const React = metro.common.React;
  const Native = metro.common.ReactNative;
  const store = client.plugin.createStorage();
  const logger = client.plugin.logger;
  const unpatches = [];
  const stats = {
    jsxFactories: 0, nativePayloads: 0, processed: 0,
    gradientsFound: 0, gradientsChanged: 0, radiusChanged: 0,
    matchingComponents: Object.create(null), errors: 0
  };
  const radiusProps = [
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    'borderTopStartRadius', 'borderTopEndRadius',
    'borderBottomStartRadius', 'borderBottomEndRadius'
  ];
  const cssColor = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      // React Native processColor commonly uses 0xAARRGGBB.
      const rgb = v >>> 0;
      return { r: (rgb >>> 16) & 255, g: (rgb >>> 8) & 255, b: rgb & 255, a: ((rgb >>> 24) & 255) / 255, number: true };
    }
    if (typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
    const match = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0?(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/);
    if (match) return { r: +match[1], g: +match[2], b: +match[3], a: match[4] == null ? 1 : +match[4] };
    const hex = s.replace(/^#/, '');
    if (/^[0-9a-f]{3,4}$/.test(hex)) {
      const x = hex.split('').map(c => parseInt(c + c, 16));
      return { r: x[0], g: x[1], b: x[2], a: x[3] == null ? 1 : x[3] / 255 };
    }
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16), a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
  };
  function darkGradient(colors) {
    if (!Array.isArray(colors) || colors.length < 2 || colors.length > 10) return false;
    const parsed = colors.map(cssColor);
    if (parsed.some(v => !v)) return false;
    if (!parsed.every(v => v.r <= 50 && v.g <= 50 && v.b <= 50)) return false;
    // Avoid replacing all-black backgrounds; must contain transparency.
    return parsed.some(v => v.a <= 0.15) && parsed.some(v => v.a >= 0.20);
  }
  function nameOf(type) {
    if (typeof type === 'string') return type;
    if (typeof type === 'function') return type.displayName || type.name || '';
    if (type && typeof type === 'object') {
      return type.displayName || type.name || type.render?.displayName || type.render?.name || type.type?.displayName || '';
    }
    return '';
  }
  function stripRadius(style) {
    if (!style || typeof style !== 'object') return style;
    if (Array.isArray(style)) {
      let changed = false;
      const out = style.map(v => { const r = stripRadius(v); changed ||= (r !== v); return r; });
      return changed ? out : style;
    }
    let changed = false;
    const out = { ...style };
    for (const key of radiusProps) {
      const value = out[key];
      if (typeof value === 'number' && value !== 0 || typeof value === 'string' && value.endsWith('%')) {
        out[key] = 0;
        changed = true;
        stats.radiusChanged++;
      }
    }
    return changed ? out : style;
  }
  function record(name) {
    if (!name) return;
    if (!stats.matchingComponents[name] && Object.keys(stats.matchingComponents).length >= 45) return;
    stats.matchingComponents[name] = (stats.matchingComponents[name] || 0) + 1;
  }
  function transform(type, props) {
    if (!props || typeof props !== 'object') return props;
    stats.processed++;
    const name = nameOf(type);
    let next = props;
    const edit = () => (next === props ? (next = { ...props }) : next);
    try {
      // Deliberately narrow: ONLY gradients with translucent dark-to-transparent stops.
      // A global gradient override is not an exact reverse-engineered Discord fix.
      if (store.removeGradients !== false && /gradient/i.test(name) && darkGradient(props.colors)) {
        stats.gradientsFound++;
        record(name);
        // Keep the component and layout but make its black shades invisible.
        // Use the same value type throughout the gradient.
        edit().colors = props.colors.map(c => typeof c === 'number' ? 0 : 'rgba(0,0,0,0)');
        stats.gradientsChanged++;
      }
      // Strip radii only on components named for video / streams. Never touch avatars.
      if (store.removeCorners !== false && /(?:video|screenshare|screen.share|stream|broadcast|rtcview)/i.test(name)) {
        if (props.style) {
          const style = stripRadius(props.style);
          if (style !== props.style) {
            edit().style = style;
            record(name);
          }
        }
        for (const key of radiusProps) {
          if (typeof props[key] === 'number' && props[key] !== 0) {
            edit()[key] = 0;
            stats.radiusChanged++;
            record(name);
          }
        }
      }
    } catch (e) {
      stats.errors++;
      if (stats.errors <= 3) logger.warn('StreamClean transform error', e);
      return props;
    }
    return next;
  }
  function patchJSX() {
    const seen = new Map();
    for (const name of ['jsx', 'jsxs', 'jsxDEV']) {
      let modules = [];
      try { modules = metro.findByPropsAll(name) || []; } catch (_) {}
      for (const mod of modules) {
        if (!mod || typeof mod[name] !== 'function') continue;
        const names = seen.get(mod) || new Set();
        if (names.has(name)) continue;
        names.add(name); seen.set(mod, names);
        try {
          unpatches.push(patcher.before(name, mod, args => {
            const changed = transform(args[0], args[1]);
            if (changed !== args[1]) args[1] = changed;
            return args;
          }));
          stats.jsxFactories++;
        } catch (e) { stats.errors++; logger.warn('StreamClean JSX patch', e); }
      }
    }
    if (React && typeof React.createElement === 'function') {
      try {
        unpatches.push(patcher.before('createElement', React, args => {
          const changed = transform(args[0], args[1]);
          if (changed !== args[1]) args[1] = changed;
          return args;
        }));
        stats.jsxFactories++;
      } catch (e) { stats.errors++; logger.warn('StreamClean React patch', e); }
    }
  }
  function patchNativeProps() {
    // RN create/diff layer; unlike JSX it also catches components whose factory
    // reference was captured before this plugin started.
    let candidates = [];
    try { candidates = metro.findByPropsAll('create', 'diff') || []; } catch (_) {}
    const seen = new Set();
    for (const mod of candidates) {
      if (seen.has(mod)) continue;
      seen.add(mod);
      if (!mod || typeof mod.create !== 'function' || typeof mod.diff !== 'function' ||
          mod.create.length !== 2 || mod.diff.length !== 3) continue;
      function nativeTransform(props) {
        if (!props || typeof props !== 'object') return props;
        const id = String(props.nativeID || props.testID || '');
        if (!/(?:stream|screenshare|screen_share|video|rtc)/i.test(id) || store.removeCorners === false) return props;
        const style = stripRadius(props.style);
        if (style === props.style) return props;
        record('native:' + id.slice(0, 60));
        return { ...props, style };
      }
      try {
        unpatches.push(patcher.before('create', mod, args => {
          args[0] = nativeTransform(args[0]); return args;
        }));
        unpatches.push(patcher.before('diff', mod, args => {
          args[0] = nativeTransform(args[0]);
          args[1] = nativeTransform(args[1]); return args;
        }));
        stats.nativePayloads++;
      } catch (e) { stats.errors++; logger.warn('StreamClean native patch', e); }
    }
  }
  function diagnostics() {
    return [
      'StreamClean Classic v0.1.0 (experimental)',
      'removeGradients=' + (store.removeGradients !== false),
      'removeCorners=' + (store.removeCorners !== false),
      'JSX hooks=' + stats.jsxFactories + ' native payload hooks=' + stats.nativePayloads,
      'JSX elements seen=' + stats.processed,
      'dark gradients seen=' + stats.gradientsFound + ' modified=' + stats.gradientsChanged,
      'radii changed=' + stats.radiusChanged + ' errors=' + stats.errors,
      'matches:',
      ...Object.entries(stats.matchingComponents).map(([k, v]) => '  ' + k + ': ' + v),
      '(no messages, user IDs, or stream contents collected)'
    ].join('\n');
  }
  function SettingsComponent() {
    // Classic Settings UI; fallback to plain Text if Discord changes forms API.
    const Forms = ui?.components?.Forms || {};
    const ScrollView = Native.ScrollView;
    const Text = Native.Text;
    const SwitchRow = Forms.FormSwitchRow;
    const FormRow = Forms.FormRow;
    const Divider = Forms.FormDivider;
    const h = React.createElement;
    const useProxy = api.storage?.useProxy;
    if (typeof useProxy === 'function') useProxy(store);
    if (!SwitchRow || !FormRow) return h(ScrollView, null, h(Text, null, diagnostics()));
    const toggle = (key) => (value) => { store[key] = value; };
    const sep = () => Divider ? h(Divider) : null;
    return h(ScrollView, null,
      h(SwitchRow, {
        label: 'Remove dark gradients',
        subLabel: 'Hide likely black fade overlays. Also affects matching gradients elsewhere in Discord.',
        value: store.removeGradients !== false,
        onValueChange: toggle('removeGradients')
      }), sep(),
      h(SwitchRow, {
        label: 'Square video corners',
        subLabel: 'Remove corner radius only on video/stream-labelled components.',
        value: store.removeCorners !== false,
        onValueChange: toggle('removeCorners')
      }), sep(),
      h(FormRow, {
        label: 'Copy diagnostics',
        subLabel: 'Open a stream first, then copy the counters and component names.',
        onPress: () => {
          const report = diagnostics();
          try { metro.common.clipboard.setString(report); } catch (_) { logger.log(report); }
          try { ui.toasts.showToast('StreamClean: report copied'); } catch (_) {}
        }
      }), sep(),
      h(Text, { selectable: true, style: { padding: 16 } }, diagnostics())
    );
  }
  return {
    start() {
      if (store.removeGradients == null) store.removeGradients = true;
      if (store.removeCorners == null) store.removeCorners = true;
      patchJSX();
      patchNativeProps();
      logger.log('StreamClean started; ' + stats.jsxFactories + ' JSX hooks, ' + stats.nativePayloads + ' native hooks');
    },
    stop() {
      for (const fn of unpatches.splice(0).reverse()) { try { fn(); } catch (_) {} }
      logger.log('StreamClean stopped');
    },
    SettingsComponent,
  };
})();
