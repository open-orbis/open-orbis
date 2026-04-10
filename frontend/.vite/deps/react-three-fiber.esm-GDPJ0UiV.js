import { r as __toESM, t as __commonJSMin } from "./chunk-BoAXSpZd.js";
import { t as require_react } from "./react.js";
import { t as require_jsx_runtime } from "./jsx-runtime-DG5Mklib.js";
import { t as createStore$1 } from "./vanilla-BGp_ExrV.js";
import { Br as LinearSRGBColorSpace, Do as SRGBColorSpace, Hs as Vector3, Qi as OrthographicCamera, Vs as Vector2, _r as Layers, c as three_module_exports, ct as Color, do as Raycaster, ko as Scene, na as PerspectiveCamera, o as WebGLRenderer, st as Clock, ut as ColorManagement } from "./three.module-CJ_QJ6Hn.js";
import { t as require_scheduler } from "./scheduler-DerDJC_6.js";
//#region node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.development.js
/**
* @license React
* use-sync-external-store-shim.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_use_sync_external_store_shim_development = /* @__PURE__ */ __commonJSMin(((exports) => {
	(function() {
		function is(x, y) {
			return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
		}
		function useSyncExternalStore$2(subscribe, getSnapshot) {
			didWarnOld18Alpha || void 0 === React.startTransition || (didWarnOld18Alpha = !0, console.error("You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release."));
			var value = getSnapshot();
			if (!didWarnUncachedGetSnapshot) {
				var cachedValue = getSnapshot();
				objectIs(value, cachedValue) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), didWarnUncachedGetSnapshot = !0);
			}
			cachedValue = useState({ inst: {
				value,
				getSnapshot
			} });
			var inst = cachedValue[0].inst, forceUpdate = cachedValue[1];
			useLayoutEffect(function() {
				inst.value = value;
				inst.getSnapshot = getSnapshot;
				checkIfSnapshotChanged(inst) && forceUpdate({ inst });
			}, [
				subscribe,
				value,
				getSnapshot
			]);
			useEffect(function() {
				checkIfSnapshotChanged(inst) && forceUpdate({ inst });
				return subscribe(function() {
					checkIfSnapshotChanged(inst) && forceUpdate({ inst });
				});
			}, [subscribe]);
			useDebugValue(value);
			return value;
		}
		function checkIfSnapshotChanged(inst) {
			var latestGetSnapshot = inst.getSnapshot;
			inst = inst.value;
			try {
				var nextValue = latestGetSnapshot();
				return !objectIs(inst, nextValue);
			} catch (error) {
				return !0;
			}
		}
		function useSyncExternalStore$1(subscribe, getSnapshot) {
			return getSnapshot();
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var React = require_react(), objectIs = "function" === typeof Object.is ? Object.is : is, useState = React.useState, useEffect = React.useEffect, useLayoutEffect = React.useLayoutEffect, useDebugValue = React.useDebugValue, didWarnOld18Alpha = !1, didWarnUncachedGetSnapshot = !1, shim = "undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement ? useSyncExternalStore$1 : useSyncExternalStore$2;
		exports.useSyncExternalStore = void 0 !== React.useSyncExternalStore ? React.useSyncExternalStore : shim;
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
//#endregion
//#region node_modules/use-sync-external-store/shim/index.js
var require_shim = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_use_sync_external_store_shim_development();
}));
//#endregion
//#region node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js
/**
* @license React
* use-sync-external-store-shim/with-selector.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_with_selector_development = /* @__PURE__ */ __commonJSMin(((exports) => {
	(function() {
		function is(x, y) {
			return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var React = require_react(), shim = require_shim(), objectIs = "function" === typeof Object.is ? Object.is : is, useSyncExternalStore = shim.useSyncExternalStore, useRef = React.useRef, useEffect = React.useEffect, useMemo = React.useMemo, useDebugValue = React.useDebugValue;
		exports.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
			var instRef = useRef(null);
			if (null === instRef.current) {
				var inst = {
					hasValue: !1,
					value: null
				};
				instRef.current = inst;
			} else inst = instRef.current;
			instRef = useMemo(function() {
				function memoizedSelector(nextSnapshot) {
					if (!hasMemo) {
						hasMemo = !0;
						memoizedSnapshot = nextSnapshot;
						nextSnapshot = selector(nextSnapshot);
						if (void 0 !== isEqual && inst.hasValue) {
							var currentSelection = inst.value;
							if (isEqual(currentSelection, nextSnapshot)) return memoizedSelection = currentSelection;
						}
						return memoizedSelection = nextSnapshot;
					}
					currentSelection = memoizedSelection;
					if (objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
					var nextSelection = selector(nextSnapshot);
					if (void 0 !== isEqual && isEqual(currentSelection, nextSelection)) return memoizedSnapshot = nextSnapshot, currentSelection;
					memoizedSnapshot = nextSnapshot;
					return memoizedSelection = nextSelection;
				}
				var hasMemo = !1, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = void 0 === getServerSnapshot ? null : getServerSnapshot;
				return [function() {
					return memoizedSelector(getSnapshot());
				}, null === maybeGetServerSnapshot ? void 0 : function() {
					return memoizedSelector(maybeGetServerSnapshot());
				}];
			}, [
				getSnapshot,
				getServerSnapshot,
				selector,
				isEqual
			]);
			var value = useSyncExternalStore(subscribe, instRef[0], instRef[1]);
			useEffect(function() {
				inst.hasValue = !0;
				inst.value = value;
			}, [value]);
			useDebugValue(value);
			return value;
		};
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
//#endregion
//#region node_modules/use-sync-external-store/shim/with-selector.js
var require_with_selector = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_with_selector_development();
}));
//#endregion
//#region node_modules/zustand/esm/traditional.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var { useSyncExternalStoreWithSelector } = (/* @__PURE__ */ __toESM(require_with_selector(), 1)).default;
var identity = (arg) => arg;
function useStoreWithEqualityFn(api, selector = identity, equalityFn) {
	const slice = useSyncExternalStoreWithSelector(api.subscribe, api.getState, api.getInitialState, selector, equalityFn);
	import_react.useDebugValue(slice);
	return slice;
}
var createWithEqualityFnImpl = (createState, defaultEqualityFn) => {
	const api = createStore$1(createState);
	const useBoundStoreWithEqualityFn = (selector, equalityFn = defaultEqualityFn) => useStoreWithEqualityFn(api, selector, equalityFn);
	Object.assign(useBoundStoreWithEqualityFn, api);
	return useBoundStoreWithEqualityFn;
};
var createWithEqualityFn = ((createState, defaultEqualityFn) => createState ? createWithEqualityFnImpl(createState, defaultEqualityFn) : createWithEqualityFnImpl);
//#endregion
//#region node_modules/suspend-react/index.js
var isPromise = (promise) => typeof promise === "object" && typeof promise.then === "function";
var globalCache = [];
function shallowEqualArrays(arrA, arrB, equal = (a, b) => a === b) {
	if (arrA === arrB) return true;
	if (!arrA || !arrB) return false;
	const len = arrA.length;
	if (arrB.length !== len) return false;
	for (let i = 0; i < len; i++) if (!equal(arrA[i], arrB[i])) return false;
	return true;
}
function query(fn, keys = null, preload = false, config = {}) {
	if (keys === null) keys = [fn];
	for (const entry of globalCache) if (shallowEqualArrays(keys, entry.keys, entry.equal)) {
		if (preload) return void 0;
		if (Object.prototype.hasOwnProperty.call(entry, "error")) throw entry.error;
		if (Object.prototype.hasOwnProperty.call(entry, "response")) {
			if (config.lifespan && config.lifespan > 0) {
				if (entry.timeout) clearTimeout(entry.timeout);
				entry.timeout = setTimeout(entry.remove, config.lifespan);
			}
			return entry.response;
		}
		if (!preload) throw entry.promise;
	}
	const entry = {
		keys,
		equal: config.equal,
		remove: () => {
			const index = globalCache.indexOf(entry);
			if (index !== -1) globalCache.splice(index, 1);
		},
		promise: (isPromise(fn) ? fn : fn(...keys)).then((response) => {
			entry.response = response;
			if (config.lifespan && config.lifespan > 0) entry.timeout = setTimeout(entry.remove, config.lifespan);
		}).catch((error) => entry.error = error)
	};
	globalCache.push(entry);
	if (!preload) throw entry.promise;
}
var suspend = (fn, keys, config) => query(fn, keys, false, config);
var preload = (fn, keys, config) => void query(fn, keys, true, config);
var clear = (keys) => {
	if (keys === void 0 || keys.length === 0) globalCache.splice(0, globalCache.length);
	else {
		const entry = globalCache.find((entry) => shallowEqualArrays(keys, entry.keys, entry.equal));
		if (entry) entry.remove();
	}
};
/* @__PURE__ */ (() => {
	var e, t;
	return typeof window != "undefined" && (((e = window.document) == null ? void 0 : e.createElement) || ((t = window.navigator) == null ? void 0 : t.product) === "ReactNative");
})() ? import_react.useLayoutEffect : import_react.useEffect;
function i$1(e, t, r) {
	if (!e) return;
	if (r(e) === !0) return e;
	let n = t ? e.return : e.child;
	for (; n;) {
		const u = i$1(n, t, r);
		if (u) return u;
		n = t ? null : n.sibling;
	}
}
function l(e) {
	try {
		return Object.defineProperties(e, {
			_currentRenderer: {
				get() {
					return null;
				},
				set() {}
			},
			_currentRenderer2: {
				get() {
					return null;
				},
				set() {}
			}
		});
	} catch (t) {
		return e;
	}
}
var a = /* @__PURE__ */ l(/* @__PURE__ */ import_react.createContext(null));
var m = class extends import_react.Component {
	render() {
		return /* @__PURE__ */ import_react.createElement(a.Provider, { value: this._reactInternals }, this.props.children);
	}
};
function c() {
	const e = import_react.useContext(a);
	if (e === null) throw new Error("its-fine: useFiber must be called within a <FiberProvider />!");
	const t = import_react.useId();
	return import_react.useMemo(() => {
		for (const n of [e, e == null ? void 0 : e.alternate]) {
			if (!n) continue;
			const u = i$1(n, !1, (d) => {
				let s = d.memoizedState;
				for (; s;) {
					if (s.memoizedState === t) return !0;
					s = s.next;
				}
			});
			if (u) return u;
		}
	}, [e, t]);
}
var p$1 = Symbol.for("react.context"), b = (e) => e !== null && typeof e == "object" && "$$typeof" in e && e.$$typeof === p$1;
function h() {
	const e = c(), [t] = import_react.useState(() => /* @__PURE__ */ new Map());
	t.clear();
	let r = e;
	for (; r;) {
		const n = r.type;
		b(n) && n !== a && !t.has(n) && t.set(n, import_react.use(l(n))), r = r.return;
	}
	return t;
}
function x() {
	const e = h();
	return import_react.useMemo(() => Array.from(e.keys()).reduce((t, r) => (n) => /* @__PURE__ */ import_react.createElement(t, null, /* @__PURE__ */ import_react.createElement(r.Provider, {
		...n,
		value: e.get(r)
	})), (t) => /* @__PURE__ */ import_react.createElement(m, { ...t })), [e]);
}
//#endregion
//#region node_modules/@react-three/fiber/dist/events-5a94e5eb.esm.js
var import_scheduler = /* @__PURE__ */ __toESM(require_scheduler());
var import_jsx_runtime = require_jsx_runtime();
var threeTypes = /* @__PURE__ */ Object.freeze({ __proto__: null });
/**
* Returns the instance's initial (outmost) root.
*/
function findInitialRoot(instance) {
	let root = instance.root;
	while (root.getState().previousRoot) root = root.getState().previousRoot;
	return root;
}
/**
* Safely flush async effects when testing, simulating a legacy root.
* @deprecated Import from React instead. import { act } from 'react'
*/
var act = import_react.act;
var isOrthographicCamera = (def) => def && def.isOrthographicCamera;
var isRef = (obj) => obj && obj.hasOwnProperty("current");
var isColorRepresentation = (value) => value != null && (typeof value === "string" || typeof value === "number" || value.isColor);
/**
* An SSR-friendly useLayoutEffect.
*
* React currently throws a warning when using useLayoutEffect on the server.
* To get around it, we can conditionally useEffect on the server (no-op) and
* useLayoutEffect elsewhere.
*
* @see https://github.com/facebook/react/issues/14927
*/
var useIsomorphicLayoutEffect = /* @__PURE__ */ ((_window$document, _window$navigator) => typeof window !== "undefined" && (((_window$document = window.document) == null ? void 0 : _window$document.createElement) || ((_window$navigator = window.navigator) == null ? void 0 : _window$navigator.product) === "ReactNative"))() ? import_react.useLayoutEffect : import_react.useEffect;
function useMutableCallback(fn) {
	const ref = import_react.useRef(fn);
	useIsomorphicLayoutEffect(() => void (ref.current = fn), [fn]);
	return ref;
}
/**
* Bridges renderer Context and StrictMode from a primary renderer.
*/
function useBridge() {
	const fiber = c();
	const ContextBridge = x();
	return import_react.useMemo(() => ({ children }) => {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(!!i$1(fiber, true, (node) => node.type === import_react.StrictMode) ? import_react.StrictMode : import_react.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextBridge, { children }) });
	}, [fiber, ContextBridge]);
}
function Block({ set }) {
	useIsomorphicLayoutEffect(() => {
		set(new Promise(() => null));
		return () => set(false);
	}, [set]);
	return null;
}
var ErrorBoundary = /* @__PURE__ */ ((_ErrorBoundary) => (_ErrorBoundary = class ErrorBoundary extends import_react.Component {
	constructor(...args) {
		super(...args);
		this.state = { error: false };
	}
	componentDidCatch(err) {
		this.props.set(err);
	}
	render() {
		return this.state.error ? null : this.props.children;
	}
}, _ErrorBoundary.getDerivedStateFromError = () => ({ error: true }), _ErrorBoundary))();
function calculateDpr(dpr) {
	var _window$devicePixelRa;
	const target = typeof window !== "undefined" ? (_window$devicePixelRa = window.devicePixelRatio) != null ? _window$devicePixelRa : 2 : 1;
	return Array.isArray(dpr) ? Math.min(Math.max(dpr[0], target), dpr[1]) : dpr;
}
/**
* Returns instance root state
*/
function getRootState(obj) {
	var _r3f;
	return (_r3f = obj.__r3f) == null ? void 0 : _r3f.root.getState();
}
var is = {
	obj: (a) => a === Object(a) && !is.arr(a) && typeof a !== "function",
	fun: (a) => typeof a === "function",
	str: (a) => typeof a === "string",
	num: (a) => typeof a === "number",
	boo: (a) => typeof a === "boolean",
	und: (a) => a === void 0,
	nul: (a) => a === null,
	arr: (a) => Array.isArray(a),
	equ(a, b, { arrays = "shallow", objects = "reference", strict = true } = {}) {
		if (typeof a !== typeof b || !!a !== !!b) return false;
		if (is.str(a) || is.num(a) || is.boo(a)) return a === b;
		const isObj = is.obj(a);
		if (isObj && objects === "reference") return a === b;
		const isArr = is.arr(a);
		if (isArr && arrays === "reference") return a === b;
		if ((isArr || isObj) && a === b) return true;
		let i;
		for (i in a) if (!(i in b)) return false;
		if (isObj && arrays === "shallow" && objects === "shallow") {
			for (i in strict ? b : a) if (!is.equ(a[i], b[i], {
				strict,
				objects: "reference"
			})) return false;
		} else for (i in strict ? b : a) if (a[i] !== b[i]) return false;
		if (is.und(i)) {
			if (isArr && a.length === 0 && b.length === 0) return true;
			if (isObj && Object.keys(a).length === 0 && Object.keys(b).length === 0) return true;
			if (a !== b) return false;
		}
		return true;
	}
};
function buildGraph(object) {
	const data = {
		nodes: {},
		materials: {},
		meshes: {}
	};
	if (object) object.traverse((obj) => {
		if (obj.name) data.nodes[obj.name] = obj;
		if (obj.material && !data.materials[obj.material.name]) data.materials[obj.material.name] = obj.material;
		if (obj.isMesh && !data.meshes[obj.name]) data.meshes[obj.name] = obj;
	});
	return data;
}
function dispose(obj) {
	if (obj.type !== "Scene") obj.dispose == null || obj.dispose();
	for (const p in obj) {
		const prop = obj[p];
		if ((prop == null ? void 0 : prop.type) !== "Scene") prop == null || prop.dispose == null || prop.dispose();
	}
}
var REACT_INTERNAL_PROPS = [
	"children",
	"key",
	"ref"
];
function getInstanceProps(pendingProps) {
	const props = {};
	for (const key in pendingProps) if (!REACT_INTERNAL_PROPS.includes(key)) props[key] = pendingProps[key];
	return props;
}
function prepare(target, root, type, props) {
	const object = target;
	let instance = object == null ? void 0 : object.__r3f;
	if (!instance) {
		instance = {
			root,
			type,
			parent: null,
			children: [],
			props: getInstanceProps(props),
			object,
			eventCount: 0,
			handlers: {},
			isHidden: false
		};
		if (object) object.__r3f = instance;
	}
	return instance;
}
function resolve(root, key) {
	if (!key.includes("-")) return {
		root,
		key,
		target: root[key]
	};
	if (key in root) return {
		root,
		key,
		target: root[key]
	};
	let target = root;
	const parts = key.split("-");
	for (const part of parts) {
		if (typeof target !== "object" || target === null) {
			if (target !== void 0) {
				const remaining = parts.slice(parts.indexOf(part)).join("-");
				return {
					root: target,
					key: remaining,
					target: void 0
				};
			}
			return {
				root,
				key,
				target: void 0
			};
		}
		key = part;
		root = target;
		target = target[key];
	}
	return {
		root,
		key,
		target
	};
}
var INDEX_REGEX = /-\d+$/;
function attach(parent, child) {
	if (is.str(child.props.attach)) {
		if (INDEX_REGEX.test(child.props.attach)) {
			const index = child.props.attach.replace(INDEX_REGEX, "");
			const { root, key } = resolve(parent.object, index);
			if (!Array.isArray(root[key])) root[key] = [];
		}
		const { root, key } = resolve(parent.object, child.props.attach);
		child.previousAttach = root[key];
		root[key] = child.object;
	} else if (is.fun(child.props.attach)) child.previousAttach = child.props.attach(parent.object, child.object);
}
function detach(parent, child) {
	if (is.str(child.props.attach)) {
		const { root, key } = resolve(parent.object, child.props.attach);
		const previous = child.previousAttach;
		if (previous === void 0) delete root[key];
		else root[key] = previous;
	} else child.previousAttach == null || child.previousAttach(parent.object, child.object);
	delete child.previousAttach;
}
var RESERVED_PROPS = [
	...REACT_INTERNAL_PROPS,
	"args",
	"dispose",
	"attach",
	"object",
	"onUpdate",
	"dispose"
];
var MEMOIZED_PROTOTYPES = /* @__PURE__ */ new Map();
function getMemoizedPrototype(root) {
	let ctor = MEMOIZED_PROTOTYPES.get(root.constructor);
	try {
		if (!ctor) {
			ctor = new root.constructor();
			MEMOIZED_PROTOTYPES.set(root.constructor, ctor);
		}
	} catch (e) {}
	return ctor;
}
function diffProps(instance, newProps) {
	const changedProps = {};
	for (const prop in newProps) {
		if (RESERVED_PROPS.includes(prop)) continue;
		if (is.equ(newProps[prop], instance.props[prop])) continue;
		changedProps[prop] = newProps[prop];
		for (const other in newProps) if (other.startsWith(`${prop}-`)) changedProps[other] = newProps[other];
	}
	for (const prop in instance.props) {
		if (RESERVED_PROPS.includes(prop) || newProps.hasOwnProperty(prop)) continue;
		const { root, key } = resolve(instance.object, prop);
		if (root.constructor && root.constructor.length === 0) {
			const ctor = getMemoizedPrototype(root);
			if (!is.und(ctor)) changedProps[key] = ctor[key];
		} else changedProps[key] = 0;
	}
	return changedProps;
}
var colorMaps = [
	"map",
	"emissiveMap",
	"sheenColorMap",
	"specularColorMap",
	"envMap"
];
var EVENT_REGEX = /^on(Pointer|Click|DoubleClick|ContextMenu|Wheel)/;
function applyProps(object, props) {
	var _instance$object;
	const instance = object.__r3f;
	const rootState = instance && findInitialRoot(instance).getState();
	const prevHandlers = instance == null ? void 0 : instance.eventCount;
	for (const prop in props) {
		let value = props[prop];
		if (RESERVED_PROPS.includes(prop)) continue;
		if (instance && EVENT_REGEX.test(prop)) {
			if (typeof value === "function") instance.handlers[prop] = value;
			else delete instance.handlers[prop];
			instance.eventCount = Object.keys(instance.handlers).length;
			continue;
		}
		if (value === void 0) continue;
		let { root, key, target } = resolve(object, prop);
		if (target === void 0 && (typeof root !== "object" || root === null)) throw Error(`R3F: Cannot set "${prop}". Ensure it is an object before setting "${key}".`);
		if (target instanceof Layers && value instanceof Layers) target.mask = value.mask;
		else if (target instanceof Color && isColorRepresentation(value)) target.set(value);
		else if (target !== null && typeof target === "object" && typeof target.set === "function" && typeof target.copy === "function" && value != null && value.constructor && target.constructor === value.constructor) target.copy(value);
		else if (target !== null && typeof target === "object" && typeof target.set === "function" && Array.isArray(value)) if (typeof target.fromArray === "function") target.fromArray(value);
		else target.set(...value);
		else if (target !== null && typeof target === "object" && typeof target.set === "function" && typeof value === "number") if (typeof target.setScalar === "function") target.setScalar(value);
		else target.set(value);
		else {
			var _root$key;
			root[key] = value;
			if (rootState && !rootState.linear && colorMaps.includes(key) && (_root$key = root[key]) != null && _root$key.isTexture && root[key].format === 1023 && root[key].type === 1009) root[key].colorSpace = SRGBColorSpace;
		}
	}
	if (instance != null && instance.parent && rootState != null && rootState.internal && (_instance$object = instance.object) != null && _instance$object.isObject3D && prevHandlers !== instance.eventCount) {
		const object = instance.object;
		const index = rootState.internal.interaction.indexOf(object);
		if (index > -1) rootState.internal.interaction.splice(index, 1);
		if (instance.eventCount && object.raycast !== null) rootState.internal.interaction.push(object);
	}
	if (instance && instance.props.attach === void 0) {
		if (instance.object.isBufferGeometry) instance.props.attach = "geometry";
		else if (instance.object.isMaterial) instance.props.attach = "material";
	}
	if (instance) invalidateInstance(instance);
	return object;
}
function invalidateInstance(instance) {
	var _instance$root;
	if (!instance.parent) return;
	instance.props.onUpdate == null || instance.props.onUpdate(instance.object);
	const state = (_instance$root = instance.root) == null ? void 0 : _instance$root.getState == null ? void 0 : _instance$root.getState();
	if (state && state.internal.frames === 0) state.invalidate();
}
function updateCamera(camera, size) {
	if (camera.manual) return;
	if (isOrthographicCamera(camera)) {
		camera.left = size.width / -2;
		camera.right = size.width / 2;
		camera.top = size.height / 2;
		camera.bottom = size.height / -2;
	} else camera.aspect = size.width / size.height;
	camera.updateProjectionMatrix();
}
var isObject3D = (object) => object == null ? void 0 : object.isObject3D;
function makeId(event) {
	return (event.eventObject || event.object).uuid + "/" + event.index + event.instanceId;
}
/**
* Release pointer captures.
* This is called by releasePointerCapture in the API, and when an object is removed.
*/
function releaseInternalPointerCapture(capturedMap, obj, captures, pointerId) {
	const captureData = captures.get(obj);
	if (captureData) {
		captures.delete(obj);
		if (captures.size === 0) {
			capturedMap.delete(pointerId);
			captureData.target.releasePointerCapture(pointerId);
		}
	}
}
function removeInteractivity(store, object) {
	const { internal } = store.getState();
	internal.interaction = internal.interaction.filter((o) => o !== object);
	internal.initialHits = internal.initialHits.filter((o) => o !== object);
	internal.hovered.forEach((value, key) => {
		if (value.eventObject === object || value.object === object) internal.hovered.delete(key);
	});
	internal.capturedMap.forEach((captures, pointerId) => {
		releaseInternalPointerCapture(internal.capturedMap, object, captures, pointerId);
	});
}
function createEvents(store) {
	/** Calculates delta */
	function calculateDistance(event) {
		const { internal } = store.getState();
		const dx = event.offsetX - internal.initialClick[0];
		const dy = event.offsetY - internal.initialClick[1];
		return Math.round(Math.sqrt(dx * dx + dy * dy));
	}
	/** Returns true if an instance has a valid pointer-event registered, this excludes scroll, clicks etc */
	function filterPointerEvents(objects) {
		return objects.filter((obj) => [
			"Move",
			"Over",
			"Enter",
			"Out",
			"Leave"
		].some((name) => {
			var _r3f;
			return (_r3f = obj.__r3f) == null ? void 0 : _r3f.handlers["onPointer" + name];
		}));
	}
	function intersect(event, filter) {
		const state = store.getState();
		const duplicates = /* @__PURE__ */ new Set();
		const intersections = [];
		const eventsObjects = filter ? filter(state.internal.interaction) : state.internal.interaction;
		for (let i = 0; i < eventsObjects.length; i++) {
			const state = getRootState(eventsObjects[i]);
			if (state) state.raycaster.camera = void 0;
		}
		if (!state.previousRoot) state.events.compute == null || state.events.compute(event, state);
		function handleRaycast(obj) {
			const state = getRootState(obj);
			if (!state || !state.events.enabled || state.raycaster.camera === null) return [];
			if (state.raycaster.camera === void 0) {
				var _state$previousRoot;
				state.events.compute == null || state.events.compute(event, state, (_state$previousRoot = state.previousRoot) == null ? void 0 : _state$previousRoot.getState());
				if (state.raycaster.camera === void 0) state.raycaster.camera = null;
			}
			return state.raycaster.camera ? state.raycaster.intersectObject(obj, true) : [];
		}
		let hits = eventsObjects.flatMap(handleRaycast).sort((a, b) => {
			const aState = getRootState(a.object);
			const bState = getRootState(b.object);
			if (!aState || !bState) return a.distance - b.distance;
			return bState.events.priority - aState.events.priority || a.distance - b.distance;
		}).filter((item) => {
			const id = makeId(item);
			if (duplicates.has(id)) return false;
			duplicates.add(id);
			return true;
		});
		if (state.events.filter) hits = state.events.filter(hits, state);
		for (const hit of hits) {
			let eventObject = hit.object;
			while (eventObject) {
				var _r3f2;
				if ((_r3f2 = eventObject.__r3f) != null && _r3f2.eventCount) intersections.push({
					...hit,
					eventObject
				});
				eventObject = eventObject.parent;
			}
		}
		if ("pointerId" in event && state.internal.capturedMap.has(event.pointerId)) {
			for (let captureData of state.internal.capturedMap.get(event.pointerId).values()) if (!duplicates.has(makeId(captureData.intersection))) intersections.push(captureData.intersection);
		}
		return intersections;
	}
	/**  Handles intersections by forwarding them to handlers */
	function handleIntersects(intersections, event, delta, callback) {
		if (intersections.length) {
			const localState = { stopped: false };
			for (const hit of intersections) {
				let state = getRootState(hit.object);
				if (!state) hit.object.traverseAncestors((obj) => {
					const parentState = getRootState(obj);
					if (parentState) {
						state = parentState;
						return false;
					}
				});
				if (state) {
					const { raycaster, pointer, camera, internal } = state;
					const unprojectedPoint = new Vector3(pointer.x, pointer.y, 0).unproject(camera);
					const hasPointerCapture = (id) => {
						var _internal$capturedMap, _internal$capturedMap2;
						return (_internal$capturedMap = (_internal$capturedMap2 = internal.capturedMap.get(id)) == null ? void 0 : _internal$capturedMap2.has(hit.eventObject)) != null ? _internal$capturedMap : false;
					};
					const setPointerCapture = (id) => {
						const captureData = {
							intersection: hit,
							target: event.target
						};
						if (internal.capturedMap.has(id)) internal.capturedMap.get(id).set(hit.eventObject, captureData);
						else internal.capturedMap.set(id, new Map([[hit.eventObject, captureData]]));
						event.target.setPointerCapture(id);
					};
					const releasePointerCapture = (id) => {
						const captures = internal.capturedMap.get(id);
						if (captures) releaseInternalPointerCapture(internal.capturedMap, hit.eventObject, captures, id);
					};
					let extractEventProps = {};
					for (let prop in event) {
						let property = event[prop];
						if (typeof property !== "function") extractEventProps[prop] = property;
					}
					let raycastEvent = {
						...hit,
						...extractEventProps,
						pointer,
						intersections,
						stopped: localState.stopped,
						delta,
						unprojectedPoint,
						ray: raycaster.ray,
						camera,
						stopPropagation() {
							const capturesForPointer = "pointerId" in event && internal.capturedMap.get(event.pointerId);
							if (!capturesForPointer || capturesForPointer.has(hit.eventObject)) {
								raycastEvent.stopped = localState.stopped = true;
								if (internal.hovered.size && Array.from(internal.hovered.values()).find((i) => i.eventObject === hit.eventObject)) cancelPointer([...intersections.slice(0, intersections.indexOf(hit)), hit]);
							}
						},
						target: {
							hasPointerCapture,
							setPointerCapture,
							releasePointerCapture
						},
						currentTarget: {
							hasPointerCapture,
							setPointerCapture,
							releasePointerCapture
						},
						nativeEvent: event
					};
					callback(raycastEvent);
					if (localState.stopped === true) break;
				}
			}
		}
		return intersections;
	}
	function cancelPointer(intersections) {
		const { internal } = store.getState();
		for (const hoveredObj of internal.hovered.values()) if (!intersections.length || !intersections.find((hit) => hit.object === hoveredObj.object && hit.index === hoveredObj.index && hit.instanceId === hoveredObj.instanceId)) {
			const instance = hoveredObj.eventObject.__r3f;
			internal.hovered.delete(makeId(hoveredObj));
			if (instance != null && instance.eventCount) {
				const handlers = instance.handlers;
				const data = {
					...hoveredObj,
					intersections
				};
				handlers.onPointerOut == null || handlers.onPointerOut(data);
				handlers.onPointerLeave == null || handlers.onPointerLeave(data);
			}
		}
	}
	function pointerMissed(event, objects) {
		for (let i = 0; i < objects.length; i++) {
			const instance = objects[i].__r3f;
			instance == null || instance.handlers.onPointerMissed == null || instance.handlers.onPointerMissed(event);
		}
	}
	function handlePointer(name) {
		switch (name) {
			case "onPointerLeave":
			case "onPointerCancel": return () => cancelPointer([]);
			case "onLostPointerCapture": return (event) => {
				const { internal } = store.getState();
				if ("pointerId" in event && internal.capturedMap.has(event.pointerId)) requestAnimationFrame(() => {
					if (internal.capturedMap.has(event.pointerId)) {
						internal.capturedMap.delete(event.pointerId);
						cancelPointer([]);
					}
				});
			};
		}
		return function handleEvent(event) {
			const { onPointerMissed, internal } = store.getState();
			internal.lastEvent.current = event;
			const isPointerMove = name === "onPointerMove";
			const isClickEvent = name === "onClick" || name === "onContextMenu" || name === "onDoubleClick";
			const hits = intersect(event, isPointerMove ? filterPointerEvents : void 0);
			const delta = isClickEvent ? calculateDistance(event) : 0;
			if (name === "onPointerDown") {
				internal.initialClick = [event.offsetX, event.offsetY];
				internal.initialHits = hits.map((hit) => hit.eventObject);
			}
			if (isClickEvent && !hits.length) {
				if (delta <= 2) {
					pointerMissed(event, internal.interaction);
					if (onPointerMissed) onPointerMissed(event);
				}
			}
			if (isPointerMove) cancelPointer(hits);
			function onIntersect(data) {
				const eventObject = data.eventObject;
				const instance = eventObject.__r3f;
				if (!(instance != null && instance.eventCount)) return;
				const handlers = instance.handlers;
				if (isPointerMove) {
					if (handlers.onPointerOver || handlers.onPointerEnter || handlers.onPointerOut || handlers.onPointerLeave) {
						const id = makeId(data);
						const hoveredItem = internal.hovered.get(id);
						if (!hoveredItem) {
							internal.hovered.set(id, data);
							handlers.onPointerOver == null || handlers.onPointerOver(data);
							handlers.onPointerEnter == null || handlers.onPointerEnter(data);
						} else if (hoveredItem.stopped) data.stopPropagation();
					}
					handlers.onPointerMove == null || handlers.onPointerMove(data);
				} else {
					const handler = handlers[name];
					if (handler) {
						if (!isClickEvent || internal.initialHits.includes(eventObject)) {
							pointerMissed(event, internal.interaction.filter((object) => !internal.initialHits.includes(object)));
							handler(data);
						}
					} else if (isClickEvent && internal.initialHits.includes(eventObject)) pointerMissed(event, internal.interaction.filter((object) => !internal.initialHits.includes(object)));
				}
			}
			handleIntersects(hits, event, delta, onIntersect);
		};
	}
	return { handlePointer };
}
var isRenderer = (def) => !!(def != null && def.render);
var context = /* @__PURE__ */ import_react.createContext(null);
var createStore = (invalidate, advance) => {
	const rootStore = createWithEqualityFn((set, get) => {
		const position = new Vector3();
		const defaultTarget = new Vector3();
		const tempTarget = new Vector3();
		function getCurrentViewport(camera = get().camera, target = defaultTarget, size = get().size) {
			const { width, height, top, left } = size;
			const aspect = width / height;
			if (target.isVector3) tempTarget.copy(target);
			else tempTarget.set(...target);
			const distance = camera.getWorldPosition(position).distanceTo(tempTarget);
			if (isOrthographicCamera(camera)) return {
				width: width / camera.zoom,
				height: height / camera.zoom,
				top,
				left,
				factor: 1,
				distance,
				aspect
			};
			else {
				const fov = camera.fov * Math.PI / 180;
				const h = 2 * Math.tan(fov / 2) * distance;
				const w = h * (width / height);
				return {
					width: w,
					height: h,
					top,
					left,
					factor: width / w,
					distance,
					aspect
				};
			}
		}
		let performanceTimeout = void 0;
		const setPerformanceCurrent = (current) => set((state) => ({ performance: {
			...state.performance,
			current
		} }));
		const pointer = new Vector2();
		return {
			set,
			get,
			gl: null,
			camera: null,
			raycaster: null,
			events: {
				priority: 1,
				enabled: true,
				connected: false
			},
			scene: null,
			xr: null,
			invalidate: (frames = 1) => invalidate(get(), frames),
			advance: (timestamp, runGlobalEffects) => advance(timestamp, runGlobalEffects, get()),
			legacy: false,
			linear: false,
			flat: false,
			controls: null,
			clock: new Clock(),
			pointer,
			mouse: pointer,
			frameloop: "always",
			onPointerMissed: void 0,
			performance: {
				current: 1,
				min: .5,
				max: 1,
				debounce: 200,
				regress: () => {
					const state = get();
					if (performanceTimeout) clearTimeout(performanceTimeout);
					if (state.performance.current !== state.performance.min) setPerformanceCurrent(state.performance.min);
					performanceTimeout = setTimeout(() => setPerformanceCurrent(get().performance.max), state.performance.debounce);
				}
			},
			size: {
				width: 0,
				height: 0,
				top: 0,
				left: 0
			},
			viewport: {
				initialDpr: 0,
				dpr: 0,
				width: 0,
				height: 0,
				top: 0,
				left: 0,
				aspect: 0,
				distance: 0,
				factor: 0,
				getCurrentViewport
			},
			setEvents: (events) => set((state) => ({
				...state,
				events: {
					...state.events,
					...events
				}
			})),
			setSize: (width, height, top = 0, left = 0) => {
				const camera = get().camera;
				const size = {
					width,
					height,
					top,
					left
				};
				set((state) => ({
					size,
					viewport: {
						...state.viewport,
						...getCurrentViewport(camera, defaultTarget, size)
					}
				}));
			},
			setDpr: (dpr) => set((state) => {
				const resolved = calculateDpr(dpr);
				return { viewport: {
					...state.viewport,
					dpr: resolved,
					initialDpr: state.viewport.initialDpr || resolved
				} };
			}),
			setFrameloop: (frameloop = "always") => {
				const clock = get().clock;
				clock.stop();
				clock.elapsedTime = 0;
				if (frameloop !== "never") {
					clock.start();
					clock.elapsedTime = 0;
				}
				set(() => ({ frameloop }));
			},
			previousRoot: void 0,
			internal: {
				interaction: [],
				hovered: /* @__PURE__ */ new Map(),
				subscribers: [],
				initialClick: [0, 0],
				initialHits: [],
				capturedMap: /* @__PURE__ */ new Map(),
				lastEvent: /* @__PURE__ */ import_react.createRef(),
				active: false,
				frames: 0,
				priority: 0,
				subscribe: (ref, priority, store) => {
					const internal = get().internal;
					internal.priority = internal.priority + (priority > 0 ? 1 : 0);
					internal.subscribers.push({
						ref,
						priority,
						store
					});
					internal.subscribers = internal.subscribers.sort((a, b) => a.priority - b.priority);
					return () => {
						const internal = get().internal;
						if (internal != null && internal.subscribers) {
							internal.priority = internal.priority - (priority > 0 ? 1 : 0);
							internal.subscribers = internal.subscribers.filter((s) => s.ref !== ref);
						}
					};
				}
			}
		};
	});
	const state = rootStore.getState();
	let oldSize = state.size;
	let oldDpr = state.viewport.dpr;
	let oldCamera = state.camera;
	rootStore.subscribe(() => {
		const { camera, size, viewport, gl, set } = rootStore.getState();
		if (size.width !== oldSize.width || size.height !== oldSize.height || viewport.dpr !== oldDpr) {
			oldSize = size;
			oldDpr = viewport.dpr;
			updateCamera(camera, size);
			if (viewport.dpr > 0) gl.setPixelRatio(viewport.dpr);
			const updateStyle = typeof HTMLCanvasElement !== "undefined" && gl.domElement instanceof HTMLCanvasElement;
			gl.setSize(size.width, size.height, updateStyle);
		}
		if (camera !== oldCamera) {
			oldCamera = camera;
			set((state) => ({ viewport: {
				...state.viewport,
				...state.viewport.getCurrentViewport(camera)
			} }));
		}
	});
	rootStore.subscribe((state) => invalidate(state));
	return rootStore;
};
/**
* Exposes an object's {@link Instance}.
* @see https://docs.pmnd.rs/react-three-fiber/api/additional-exports#useInstanceHandle
*
* **Note**: this is an escape hatch to react-internal fields. Expect this to change significantly between versions.
*/
function useInstanceHandle(ref) {
	const instance = import_react.useRef(null);
	import_react.useImperativeHandle(instance, () => ref.current.__r3f, [ref]);
	return instance;
}
/**
* Returns the R3F Canvas' Zustand store. Useful for [transient updates](https://github.com/pmndrs/zustand#transient-updates-for-often-occurring-state-changes).
* @see https://docs.pmnd.rs/react-three-fiber/api/hooks#usestore
*/
function useStore() {
	const store = import_react.useContext(context);
	if (!store) throw new Error("R3F: Hooks can only be used within the Canvas component!");
	return store;
}
/**
* Accesses R3F's internal state, containing renderer, canvas, scene, etc.
* @see https://docs.pmnd.rs/react-three-fiber/api/hooks#usethree
*/
function useThree(selector = (state) => state, equalityFn) {
	return useStore()(selector, equalityFn);
}
/**
* Executes a callback before render in a shared frame loop.
* Can order effects with render priority or manually render with a positive priority.
* @see https://docs.pmnd.rs/react-three-fiber/api/hooks#useframe
*/
function useFrame(callback, renderPriority = 0) {
	const store = useStore();
	const subscribe = store.getState().internal.subscribe;
	const ref = useMutableCallback(callback);
	useIsomorphicLayoutEffect(() => subscribe(ref, renderPriority, store), [
		renderPriority,
		subscribe,
		store
	]);
	return null;
}
/**
* Returns a node graph of an object with named nodes & materials.
* @see https://docs.pmnd.rs/react-three-fiber/api/hooks#usegraph
*/
function useGraph(object) {
	return import_react.useMemo(() => buildGraph(object), [object]);
}
var memoizedLoaders = /* @__PURE__ */ new WeakMap();
var isConstructor$1 = (value) => {
	var _value$prototype;
	return typeof value === "function" && (value == null ? void 0 : (_value$prototype = value.prototype) == null ? void 0 : _value$prototype.constructor) === value;
};
function loadingFn(extensions, onProgress) {
	return function(Proto, ...input) {
		let loader;
		if (isConstructor$1(Proto)) {
			loader = memoizedLoaders.get(Proto);
			if (!loader) {
				loader = new Proto();
				memoizedLoaders.set(Proto, loader);
			}
		} else loader = Proto;
		if (extensions) extensions(loader);
		return Promise.all(input.map((input) => new Promise((res, reject) => loader.load(input, (data) => {
			if (isObject3D(data == null ? void 0 : data.scene)) Object.assign(data, buildGraph(data.scene));
			res(data);
		}, onProgress, (error) => reject(/* @__PURE__ */ new Error(`Could not load ${input}: ${error == null ? void 0 : error.message}`))))));
	};
}
/**
* Synchronously loads and caches assets with a three loader.
*
* Note: this hook's caller must be wrapped with `React.Suspense`
* @see https://docs.pmnd.rs/react-three-fiber/api/hooks#useloader
*/
function useLoader(loader, input, extensions, onProgress) {
	const keys = Array.isArray(input) ? input : [input];
	const results = suspend(loadingFn(extensions, onProgress), [loader, ...keys], { equal: is.equ });
	return Array.isArray(input) ? results : results[0];
}
/**
* Preloads an asset into cache as a side-effect.
*/
useLoader.preload = function(loader, input, extensions) {
	const keys = Array.isArray(input) ? input : [input];
	return preload(loadingFn(extensions), [loader, ...keys]);
};
/**
* Removes a loaded asset from cache.
*/
useLoader.clear = function(loader, input) {
	return clear([loader, ...Array.isArray(input) ? input : [input]]);
};
/**
* @license React
* react-reconciler-constants.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/ var t = 1, o = 8, r = 32, e = 2;
var packageData = {
	name: "@react-three/fiber",
	version: "9.5.0",
	description: "A React renderer for Threejs",
	keywords: [
		"react",
		"renderer",
		"fiber",
		"three",
		"threejs"
	],
	author: "Paul Henschel (https://github.com/drcmda)",
	license: "MIT",
	maintainers: [
		"Josh Ellis (https://github.com/joshuaellis)",
		"Cody Bennett (https://github.com/codyjasonbennett)",
		"Kris Baumgarter (https://github.com/krispya)"
	],
	bugs: { url: "https://github.com/pmndrs/react-three-fiber/issues" },
	homepage: "https://github.com/pmndrs/react-three-fiber#readme",
	repository: {
		type: "git",
		url: "git+https://github.com/pmndrs/react-three-fiber.git"
	},
	collective: {
		type: "opencollective",
		url: "https://opencollective.com/react-three-fiber"
	},
	main: "dist/react-three-fiber.cjs.js",
	module: "dist/react-three-fiber.esm.js",
	types: "dist/react-three-fiber.cjs.d.ts",
	"react-native": "native/dist/react-three-fiber-native.cjs.js",
	sideEffects: false,
	preconstruct: { entrypoints: ["index.tsx", "native.tsx"] },
	scripts: { prebuild: "cp ../../readme.md readme.md" },
	devDependencies: {
		"@types/react-reconciler": "^0.32.3",
		"react-reconciler": "^0.33.0"
	},
	dependencies: {
		"@babel/runtime": "^7.17.8",
		"@types/webxr": "*",
		"base64-js": "^1.5.1",
		buffer: "^6.0.3",
		"its-fine": "^2.0.0",
		"react-use-measure": "^2.1.7",
		scheduler: "^0.27.0",
		"suspend-react": "^0.1.3",
		"use-sync-external-store": "^1.4.0",
		zustand: "^5.0.3"
	},
	peerDependencies: {
		expo: ">=43.0",
		"expo-asset": ">=8.4",
		"expo-file-system": ">=11.0",
		"expo-gl": ">=11.0",
		react: ">=19 <19.3",
		"react-dom": ">=19 <19.3",
		"react-native": ">=0.78",
		three: ">=0.156"
	},
	peerDependenciesMeta: {
		"react-dom": { optional: true },
		"react-native": { optional: true },
		expo: { optional: true },
		"expo-asset": { optional: true },
		"expo-file-system": { optional: true },
		"expo-gl": { optional: true }
	}
};
function Xb(Tt) {
	return Tt && Tt.__esModule && Object.prototype.hasOwnProperty.call(Tt, "default") ? Tt.default : Tt;
}
var Rm = { exports: {} };
({ exports: {} }).exports;
var Mg = { exports: {} };
Mg.exports;
var Rb;
function e0() {
	return Rb || (Rb = 1, function(Tt) {
		Tt.exports = function(m) {
			function Yn(e, n) {
				for (e = e.memoizedState; e !== null && 0 < n;) e = e.next, n--;
				return e;
			}
			function _d(e, n, o, i) {
				if (o >= n.length) return i;
				var s = n[o], u = fn(e) ? e.slice() : ze({}, e);
				return u[s] = _d(e[s], n, o + 1, i), u;
			}
			function F(e, n, o) {
				if (n.length !== o.length) console.warn("copyWithRename() expects paths of the same length");
				else {
					for (var i = 0; i < o.length - 1; i++) if (n[i] !== o[i]) {
						console.warn("copyWithRename() expects paths to be the same except for the deepest key");
						return;
					}
					return Rd(e, n, o, 0);
				}
			}
			function Rd(e, n, o, i) {
				var s = n[i], u = fn(e) ? e.slice() : ze({}, e);
				return i + 1 === n.length ? (u[o[i]] = u[s], fn(u) ? u.splice(s, 1) : delete u[s]) : u[s] = Rd(e[s], n, o, i + 1), u;
			}
			function du(e, n, o) {
				var i = n[o], s = fn(e) ? e.slice() : ze({}, e);
				return o + 1 === n.length ? (fn(s) ? s.splice(i, 1) : delete s[i], s) : (s[i] = du(e[i], n, o + 1), s);
			}
			function fu() {
				return !1;
			}
			function pu() {
				return null;
			}
			function lt(e, n, o, i) {
				return new Vm(e, n, o, i);
			}
			function Fl(e, n) {
				e.context === Oe && (Wh(n, e, null, null), Ls());
			}
			function hu(e, n) {
				if (co !== null) {
					var o = n.staleFamilies;
					n = n.updatedFamilies, el(), jh(e.current, n, o), Ls();
				}
			}
			function Ir(e) {
				co = e;
			}
			function D() {
				console.error("Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks");
			}
			function Ce() {
				console.error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
			}
			function Em() {}
			function Zo() {}
			function Lr(e) {
				var n = [];
				return e.forEach(function(o) {
					n.push(o);
				}), n.sort().join(", ");
			}
			function Pi(e) {
				var n = e, o = e;
				if (e.alternate) for (; n.return;) n = n.return;
				else {
					e = n;
					do
						n = e, n.flags & 4098 && (o = n.return), e = n.return;
					while (e);
				}
				return n.tag === 3 ? o : null;
			}
			function Tp(e) {
				if (Pi(e) !== e) throw Error("Unable to find node on an unmounted component.");
			}
			function Ed(e) {
				var n = e.alternate;
				if (!n) {
					if (n = Pi(e), n === null) throw Error("Unable to find node on an unmounted component.");
					return n !== e ? null : e;
				}
				for (var o = e, i = n;;) {
					var s = o.return;
					if (s === null) break;
					var u = s.alternate;
					if (u === null) {
						if (i = s.return, i !== null) {
							o = i;
							continue;
						}
						break;
					}
					if (s.child === u.child) {
						for (u = s.child; u;) {
							if (u === o) return Tp(s), e;
							if (u === i) return Tp(s), n;
							u = u.sibling;
						}
						throw Error("Unable to find node on an unmounted component.");
					}
					if (o.return !== i.return) o = s, i = u;
					else {
						for (var f = !1, p = s.child; p;) {
							if (p === o) {
								f = !0, o = s, i = u;
								break;
							}
							if (p === i) {
								f = !0, i = s, o = u;
								break;
							}
							p = p.sibling;
						}
						if (!f) {
							for (p = u.child; p;) {
								if (p === o) {
									f = !0, o = u, i = s;
									break;
								}
								if (p === i) {
									f = !0, i = u, o = s;
									break;
								}
								p = p.sibling;
							}
							if (!f) throw Error("Child was not found in either parent set. This indicates a bug in React related to the return pointer. Please file an issue.");
						}
					}
					if (o.alternate !== i) throw Error("Return fibers should always be each others' alternates. This error is likely caused by a bug in React. Please file an issue.");
				}
				if (o.tag !== 3) throw Error("Unable to find node on an unmounted component.");
				return o.stateNode.current === o ? e : n;
			}
			function mu(e) {
				return e = Ed(e), e !== null ? xi(e) : null;
			}
			function xi(e) {
				var n = e.tag;
				if (n === 5 || n === 26 || n === 27 || n === 6) return e;
				for (e = e.child; e !== null;) {
					if (n = xi(e), n !== null) return n;
					e = e.sibling;
				}
				return null;
			}
			function _p(e) {
				var n = e.tag;
				if (n === 5 || n === 26 || n === 27 || n === 6) return e;
				for (e = e.child; e !== null;) {
					if (e.tag !== 4 && (n = _p(e), n !== null)) return n;
					e = e.sibling;
				}
				return null;
			}
			function Yo(e) {
				return e === null || typeof e != "object" ? null : (e = ni && e[ni] || e["@@iterator"], typeof e == "function" ? e : null);
			}
			function $e(e) {
				if (e == null) return null;
				if (typeof e == "function") return e.$$typeof === il ? null : e.displayName || e.name || null;
				if (typeof e == "string") return e;
				switch (e) {
					case ol: return "Fragment";
					case Uf: return "Profiler";
					case Lc: return "StrictMode";
					case Nc: return "Suspense";
					case Bf: return "SuspenseList";
					case Ds: return "Activity";
				}
				if (typeof e == "object") switch (typeof e.tag == "number" && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), e.$$typeof) {
					case Ao: return "Portal";
					case on: return e.displayName || "Context";
					case ei: return (e._context.displayName || "Context") + ".Consumer";
					case jn:
						var n = e.render;
						return e = e.displayName, e || (e = n.displayName || n.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
					case al: return n = e.displayName || null, n !== null ? n : $e(e.type) || "Memo";
					case kt:
						n = e._payload, e = e._init;
						try {
							return $e(e(n));
						} catch {}
				}
				return null;
			}
			function G(e) {
				var n = e.type;
				switch (e.tag) {
					case 31: return "Activity";
					case 24: return "Cache";
					case 9: return (n._context.displayName || "Context") + ".Consumer";
					case 10: return n.displayName || "Context";
					case 18: return "DehydratedFragment";
					case 11: return e = n.render, e = e.displayName || e.name || "", n.displayName || (e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef");
					case 7: return "Fragment";
					case 26:
					case 27:
					case 5: return n;
					case 4: return "Portal";
					case 3: return "Root";
					case 6: return "Text";
					case 16: return $e(n);
					case 8: return n === Lc ? "StrictMode" : "Mode";
					case 22: return "Offscreen";
					case 12: return "Profiler";
					case 21: return "Scope";
					case 13: return "Suspense";
					case 19: return "SuspenseList";
					case 25: return "TracingMarker";
					case 1:
					case 0:
					case 14:
					case 15:
						if (typeof n == "function") return n.displayName || n.name || null;
						if (typeof n == "string") return n;
						break;
					case 29:
						if (n = e._debugInfo, n != null) {
							for (var o = n.length - 1; 0 <= o; o--) if (typeof n[o].name == "string") return n[o].name;
						}
						if (e.return !== null) return G(e.return);
				}
				return null;
			}
			function st(e) {
				return { current: e };
			}
			function Ze(e, n) {
				0 > V ? console.error("Unexpected pop.") : (n !== W[V] && console.error("Unexpected Fiber popped."), e.current = A[V], A[V] = null, W[V] = null, V--);
			}
			function pe(e, n, o) {
				V++, A[V] = e.current, W[V] = o, e.current = n;
			}
			function Im(e) {
				return e >>>= 0, e === 0 ? 32 : 31 - (li(e) / P | 0) | 0;
			}
			function _t(e) {
				var n = e & 42;
				if (n !== 0) return n;
				switch (e & -e) {
					case 1: return 1;
					case 2: return 2;
					case 4: return 4;
					case 8: return 8;
					case 16: return 16;
					case 32: return 32;
					case 64: return 64;
					case 128: return 128;
					case 256:
					case 512:
					case 1024:
					case 2048:
					case 4096:
					case 8192:
					case 16384:
					case 32768:
					case 65536:
					case 131072: return e & 261888;
					case 262144:
					case 524288:
					case 1048576:
					case 2097152: return e & 3932160;
					case 4194304:
					case 8388608:
					case 16777216:
					case 33554432: return e & 62914560;
					case 67108864: return 67108864;
					case 134217728: return 134217728;
					case 268435456: return 268435456;
					case 536870912: return 536870912;
					case 1073741824: return 0;
					default: return console.error("Should have found matching lanes. This is a bug in React."), e;
				}
			}
			function zi(e, n, o) {
				var i = e.pendingLanes;
				if (i === 0) return 0;
				var s = 0, u = e.suspendedLanes, f = e.pingedLanes;
				e = e.warmLanes;
				var p = i & 134217727;
				return p !== 0 ? (i = p & ~u, i !== 0 ? s = _t(i) : (f &= p, f !== 0 ? s = _t(f) : o || (o = p & ~e, o !== 0 && (s = _t(o))))) : (p = i & ~u, p !== 0 ? s = _t(p) : f !== 0 ? s = _t(f) : o || (o = i & ~e, o !== 0 && (s = _t(o)))), s === 0 ? 0 : n !== 0 && n !== s && (n & u) === 0 && (u = s & -s, o = n & -n, u >= o || u === 32 && (o & 4194048) !== 0) ? n : s;
			}
			function Hl(e, n) {
				return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & n) === 0;
			}
			function Rp(e, n) {
				switch (e) {
					case 1:
					case 2:
					case 4:
					case 8:
					case 64: return n + 250;
					case 16:
					case 32:
					case 128:
					case 256:
					case 512:
					case 1024:
					case 2048:
					case 4096:
					case 8192:
					case 16384:
					case 32768:
					case 65536:
					case 131072:
					case 262144:
					case 524288:
					case 1048576:
					case 2097152: return n + 5e3;
					case 4194304:
					case 8388608:
					case 16777216:
					case 33554432: return -1;
					case 67108864:
					case 134217728:
					case 268435456:
					case 536870912:
					case 1073741824: return -1;
					default: return console.error("Should have found matching lanes. This is a bug in React."), -1;
				}
			}
			function ut() {
				var e = H;
				return H <<= 1, !(H & 62914560) && (H = 4194304), e;
			}
			function or(e) {
				for (var n = [], o = 0; 31 > o; o++) n.push(e);
				return n;
			}
			function Ci(e, n) {
				e.pendingLanes |= n, n !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
			}
			function Id(e, n, o, i, s, u) {
				var f = e.pendingLanes;
				e.pendingLanes = o, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= o, e.entangledLanes &= o, e.errorRecoveryDisabledLanes &= o, e.shellSuspendCounter = 0;
				var p = e.entanglements, g = e.expirationTimes, S = e.hiddenUpdates;
				for (o = f & ~o; 0 < o;) {
					var T = 31 - vn(o), _ = 1 << T;
					p[T] = 0, g[T] = -1;
					var I = S[T];
					if (I !== null) for (S[T] = null, T = 0; T < I.length; T++) {
						var O = I[T];
						O !== null && (O.lane &= -536870913);
					}
					o &= ~_;
				}
				i !== 0 && gu(e, i, 0), u !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= u & ~(f & ~n));
			}
			function gu(e, n, o) {
				e.pendingLanes |= n, e.suspendedLanes &= ~n;
				var i = 31 - vn(n);
				e.entangledLanes |= n, e.entanglements[i] = e.entanglements[i] | 1073741824 | o & 261930;
			}
			function Ld(e, n) {
				var o = e.entangledLanes |= n;
				for (e = e.entanglements; o;) {
					var i = 31 - vn(o), s = 1 << i;
					s & n | e[i] & n && (e[i] |= n), o &= ~s;
				}
			}
			function Al(e, n) {
				var o = n & -n;
				return o = (o & 42) !== 0 ? 1 : Xo(o), (o & (e.suspendedLanes | n)) !== 0 ? 0 : o;
			}
			function Xo(e) {
				switch (e) {
					case 2:
						e = 1;
						break;
					case 8:
						e = 4;
						break;
					case 32:
						e = 16;
						break;
					case 256:
					case 512:
					case 1024:
					case 2048:
					case 4096:
					case 8192:
					case 16384:
					case 32768:
					case 65536:
					case 131072:
					case 262144:
					case 524288:
					case 1048576:
					case 2097152:
					case 4194304:
					case 8388608:
					case 16777216:
					case 33554432:
						e = 128;
						break;
					case 268435456:
						e = 134217728;
						break;
					default: e = 0;
				}
				return e;
			}
			function yu(e, n, o) {
				if (wa) for (e = e.pendingUpdatersLaneMap; 0 < o;) {
					var i = 31 - vn(o), s = 1 << i;
					e[i].add(n), o &= ~s;
				}
			}
			function jl(e, n) {
				if (wa) for (var o = e.pendingUpdatersLaneMap, i = e.memoizedUpdaters; 0 < n;) {
					var s = 31 - vn(n);
					e = 1 << s, s = o[s], 0 < s.size && (s.forEach(function(u) {
						var f = u.alternate;
						f !== null && i.has(f) || i.add(u);
					}), s.clear()), n &= ~e;
				}
			}
			function ar(e) {
				return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
			}
			function Ep(e) {
				if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u") return !1;
				var n = __REACT_DEVTOOLS_GLOBAL_HOOK__;
				if (n.isDisabled) return !0;
				if (!n.supportsFiber) return console.error("The installed version of React DevTools is too old and will not work with the current version of React. Please update React DevTools. https://react.dev/link/react-devtools"), !0;
				try {
					td = n.inject(e), zt = n;
				} catch (o) {
					console.error("React instrumentation encountered an error: %o.", o);
				}
				return !!n.checkDCE;
			}
			function De(e) {
				if (typeof Ib == "function" && Lb(e), zt && typeof zt.setStrictMode == "function") try {
					zt.setStrictMode(td, e);
				} catch (n) {
					ka || (ka = !0, console.error("React instrumentation encountered an error: %o", n));
				}
			}
			function Ti(e, n) {
				return e === n && (e !== 0 || 1 / e === 1 / n) || e !== e && n !== n;
			}
			function _a(e) {
				for (var n = 0, o = 0; o < e.length; o++) {
					var i = e[o];
					if (typeof i == "object" && i !== null) if (fn(i) && i.length === 2 && typeof i[0] == "string") {
						if (n !== 0 && n !== 3) return 1;
						n = 3;
					} else return 1;
					else {
						if (typeof i == "function" || typeof i == "string" && 50 < i.length || n !== 0 && n !== 2) return 1;
						n = 2;
					}
				}
				return n;
			}
			function Dl(e, n, o, i) {
				for (var s in e) Xm.call(e, s) && s[0] !== "_" && ct(s, e[s], n, o, i);
			}
			function ct(e, n, o, i, s) {
				switch (typeof n) {
					case "object": if (n === null) {
						n = "null";
						break;
					} else {
						if (n.$$typeof === Ho) {
							var u = $e(n.type) || "…", f = n.key;
							n = n.props;
							var p = Object.keys(n), g = p.length;
							if (f == null && g === 0) {
								n = "<" + u + " />";
								break;
							}
							if (3 > i || g === 1 && p[0] === "children" && f == null) {
								n = "<" + u + " … />";
								break;
							}
							o.push([s + "\xA0\xA0".repeat(i) + e, "<" + u]), f !== null && ct("key", f, o, i + 1, s), e = !1;
							for (var S in n) S === "children" ? n.children != null && (!fn(n.children) || 0 < n.children.length) && (e = !0) : Xm.call(n, S) && S[0] !== "_" && ct(S, n[S], o, i + 1, s);
							o.push(["", e ? ">…</" + u + ">" : "/>"]);
							return;
						}
						if (u = Object.prototype.toString.call(n), u = u.slice(8, u.length - 1), u === "Array") {
							if (S = _a(n), S === 2 || S === 0) {
								n = JSON.stringify(n);
								break;
							} else if (S === 3) {
								for (o.push([s + "\xA0\xA0".repeat(i) + e, ""]), e = 0; e < n.length; e++) u = n[e], ct(u[0], u[1], o, i + 1, s);
								return;
							}
						}
						if (u === "Promise") {
							if (n.status === "fulfilled") {
								if (u = o.length, ct(e, n.value, o, i, s), o.length > u) {
									o = o[u], o[1] = "Promise<" + (o[1] || "Object") + ">";
									return;
								}
							} else if (n.status === "rejected" && (u = o.length, ct(e, n.reason, o, i, s), o.length > u)) {
								o = o[u], o[1] = "Rejected Promise<" + o[1] + ">";
								return;
							}
							o.push(["\xA0\xA0".repeat(i) + e, "Promise"]);
							return;
						}
						u === "Object" && (S = Object.getPrototypeOf(n)) && typeof S.constructor == "function" && (u = S.constructor.name), o.push([s + "\xA0\xA0".repeat(i) + e, u === "Object" ? 3 > i ? "" : "…" : u]), 3 > i && Dl(n, o, i + 1, s);
						return;
					}
					case "function":
						n = n.name === "" ? "() => {}" : n.name + "() {}";
						break;
					case "string":
						n = n === "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects." ? "…" : JSON.stringify(n);
						break;
					case "undefined":
						n = "undefined";
						break;
					case "boolean":
						n = n ? "true" : "false";
						break;
					default: n = String(n);
				}
				o.push([s + "\xA0\xA0".repeat(i) + e, n]);
			}
			function fo(e, n, o, i) {
				var s = !0;
				for (f in e) f in n || (o.push(["–\xA0" + "\xA0\xA0".repeat(i) + f, "…"]), s = !1);
				for (var u in n) if (u in e) {
					var f = e[u], p = n[u];
					if (f !== p) {
						if (i === 0 && u === "children") s = "\xA0\xA0".repeat(i) + u, o.push(["–\xA0" + s, "…"], ["+\xA0" + s, "…"]);
						else {
							if (!(3 <= i)) {
								if (typeof f == "object" && typeof p == "object" && f !== null && p !== null && f.$$typeof === p.$$typeof) if (p.$$typeof === Ho) {
									if (f.type === p.type && f.key === p.key) {
										f = $e(p.type) || "…", s = "\xA0\xA0".repeat(i) + u, f = "<" + f + " … />", o.push(["–\xA0" + s, f], ["+\xA0" + s, f]), s = !1;
										continue;
									}
								} else {
									var g = Object.prototype.toString.call(f), S = Object.prototype.toString.call(p);
									if (g === S && (S === "[object Object]" || S === "[object Array]")) {
										g = [" \xA0" + "\xA0\xA0".repeat(i) + u, S === "[object Array]" ? "Array" : ""], o.push(g), S = o.length, fo(f, p, o, i + 1) ? S === o.length && (g[1] = "Referentially unequal but deeply equal objects. Consider memoization.") : s = !1;
										continue;
									}
								}
								else if (typeof f == "function" && typeof p == "function" && f.name === p.name && f.length === p.length && (g = Function.prototype.toString.call(f), S = Function.prototype.toString.call(p), g === S)) {
									f = p.name === "" ? "() => {}" : p.name + "() {}", o.push([" \xA0" + "\xA0\xA0".repeat(i) + u, f + " Referentially unequal function closure. Consider memoization."]);
									continue;
								}
							}
							ct(u, f, o, i, "–\xA0"), ct(u, p, o, i, "+\xA0");
						}
						s = !1;
					}
				} else o.push(["+\xA0" + "\xA0\xA0".repeat(i) + u, "…"]), s = !1;
				return s;
			}
			function En(e) {
				fe = e & 63 ? "Blocking" : e & 64 ? "Gesture" : e & 4194176 ? "Transition" : e & 62914560 ? "Suspense" : e & 2080374784 ? "Idle" : "Other";
			}
			function Ot(e, n, o, i) {
				Me && (bl.start = n, bl.end = o, si.color = "warning", si.tooltipText = i, si.properties = null, (e = e._debugTask) ? e.run(performance.measure.bind(performance, i, bl)) : performance.measure(i, bl));
			}
			function _i(e, n, o) {
				Ot(e, n, o, "Reconnect");
			}
			function po(e, n, o, i, s) {
				var u = G(e);
				if (u !== null && Me) {
					var f = e.alternate, p = e.actualDuration;
					if (f === null || f.child !== e.child) for (var g = e.child; g !== null; g = g.sibling) p -= g.actualDuration;
					i = .5 > p ? i ? "tertiary-light" : "primary-light" : 10 > p ? i ? "tertiary" : "primary" : 100 > p ? i ? "tertiary-dark" : "primary-dark" : "error";
					var S = e.memoizedProps;
					p = e._debugTask, S !== null && f !== null && f.memoizedProps !== S ? (g = [Hb], S = fo(f.memoizedProps, S, g, 0), 1 < g.length && (S && !yl && (f.lanes & s) === 0 && 100 < e.actualDuration ? (yl = !0, g[0] = Ab, si.color = "warning", si.tooltipText = "This component received deeply equal props. It might benefit from useMemo or the React Compiler in its owner.") : (si.color = i, si.tooltipText = u), si.properties = g, bl.start = n, bl.end = o, p != null ? p.run(performance.measure.bind(performance, "​" + u, bl)) : performance.measure("​" + u, bl))) : p != null ? p.run(console.timeStamp.bind(console, u, n, o, "Components ⚛", void 0, i)) : console.timeStamp(u, n, o, "Components ⚛", void 0, i);
				}
			}
			function Ri(e, n, o, i) {
				if (Me) {
					var s = G(e);
					if (s !== null) {
						for (var u = null, f = [], p = 0; p < i.length; p++) {
							var g = i[p];
							u == null && g.source !== null && (u = g.source._debugTask), g = g.value, f.push(["Error", typeof g == "object" && g !== null && typeof g.message == "string" ? String(g.message) : String(g)]);
						}
						e.key !== null && ct("key", e.key, f, 0, ""), e.memoizedProps !== null && Dl(e.memoizedProps, f, 0, ""), u ??= e._debugTask, e = {
							start: n,
							end: o,
							detail: { devtools: {
								color: "error",
								track: "Components ⚛",
								tooltipText: e.tag === 13 ? "Hydration failed" : "Error boundary caught an error",
								properties: f
							} }
						}, u ? u.run(performance.measure.bind(performance, "​" + s, e)) : performance.measure("​" + s, e);
					}
				}
			}
			function Un(e, n, o, i, s) {
				if (s !== null) {
					if (Me) {
						var u = G(e);
						if (u !== null) {
							i = [];
							for (var f = 0; f < s.length; f++) {
								var p = s[f].value;
								i.push(["Error", typeof p == "object" && p !== null && typeof p.message == "string" ? String(p.message) : String(p)]);
							}
							e.key !== null && ct("key", e.key, i, 0, ""), e.memoizedProps !== null && Dl(e.memoizedProps, i, 0, ""), n = {
								start: n,
								end: o,
								detail: { devtools: {
									color: "error",
									track: "Components ⚛",
									tooltipText: "A lifecycle or effect errored",
									properties: i
								} }
							}, (e = e._debugTask) ? e.run(performance.measure.bind(performance, "​" + u, n)) : performance.measure("​" + u, n);
						}
					}
				} else u = G(e), u !== null && Me && (s = 1 > i ? "secondary-light" : 100 > i ? "secondary" : 500 > i ? "secondary-dark" : "error", (e = e._debugTask) ? e.run(console.timeStamp.bind(console, u, n, o, "Components ⚛", void 0, s)) : console.timeStamp(u, n, o, "Components ⚛", void 0, s));
			}
			function In(e, n, o, i) {
				if (Me && !(n <= e)) {
					var s = (o & 738197653) === o ? "tertiary-dark" : "primary-dark";
					o = (o & 536870912) === o ? "Prepared" : (o & 201326741) === o ? "Hydrated" : "Render", i ? i.run(console.timeStamp.bind(console, o, e, n, fe, "Scheduler ⚛", s)) : console.timeStamp(o, e, n, fe, "Scheduler ⚛", s);
				}
			}
			function Wl(e, n, o, i) {
				!Me || n <= e || (o = (o & 738197653) === o ? "tertiary-dark" : "primary-dark", i ? i.run(console.timeStamp.bind(console, "Prewarm", e, n, fe, "Scheduler ⚛", o)) : console.timeStamp("Prewarm", e, n, fe, "Scheduler ⚛", o));
			}
			function Nd(e, n, o, i) {
				!Me || n <= e || (o = (o & 738197653) === o ? "tertiary-dark" : "primary-dark", i ? i.run(console.timeStamp.bind(console, "Suspended", e, n, fe, "Scheduler ⚛", o)) : console.timeStamp("Suspended", e, n, fe, "Scheduler ⚛", o));
			}
			function Fd(e, n, o, i, s, u) {
				if (Me && !(n <= e)) {
					o = [];
					for (var f = 0; f < i.length; f++) {
						var p = i[f].value;
						o.push(["Recoverable Error", typeof p == "object" && p !== null && typeof p.message == "string" ? String(p.message) : String(p)]);
					}
					e = {
						start: e,
						end: n,
						detail: { devtools: {
							color: "primary-dark",
							track: fe,
							trackGroup: "Scheduler ⚛",
							tooltipText: s ? "Hydration Failed" : "Recovered after Error",
							properties: o
						} }
					}, u ? u.run(performance.measure.bind(performance, "Recovered", e)) : performance.measure("Recovered", e);
				}
			}
			function Ra(e, n, o, i) {
				!Me || n <= e || (i ? i.run(console.timeStamp.bind(console, "Errored", e, n, fe, "Scheduler ⚛", "error")) : console.timeStamp("Errored", e, n, fe, "Scheduler ⚛", "error"));
			}
			function bu(e, n, o, i) {
				!Me || n <= e || (i ? i.run(console.timeStamp.bind(console, o, e, n, fe, "Scheduler ⚛", "secondary-light")) : console.timeStamp(o, e, n, fe, "Scheduler ⚛", "secondary-light"));
			}
			function ir(e, n, o, i, s) {
				if (Me && !(n <= e)) {
					for (var u = [], f = 0; f < o.length; f++) {
						var p = o[f].value;
						u.push(["Error", typeof p == "object" && p !== null && typeof p.message == "string" ? String(p.message) : String(p)]);
					}
					e = {
						start: e,
						end: n,
						detail: { devtools: {
							color: "error",
							track: fe,
							trackGroup: "Scheduler ⚛",
							tooltipText: i ? "Remaining Effects Errored" : "Commit Errored",
							properties: u
						} }
					}, s ? s.run(performance.measure.bind(performance, "Errored", e)) : performance.measure("Errored", e);
				}
			}
			function Ea() {}
			function Ip() {
				if (Yf === 0) {
					Gg = console.log, Jg = console.info, Zg = console.warn, Yg = console.error, Xg = console.group, Kg = console.groupCollapsed, ey = console.groupEnd;
					var e = {
						configurable: !0,
						enumerable: !0,
						value: Ea,
						writable: !0
					};
					Object.defineProperties(console, {
						info: e,
						log: e,
						warn: e,
						error: e,
						group: e,
						groupCollapsed: e,
						groupEnd: e
					});
				}
				Yf++;
			}
			function Lp() {
				if (Yf--, Yf === 0) {
					var e = {
						configurable: !0,
						enumerable: !0,
						writable: !0
					};
					Object.defineProperties(console, {
						log: ze({}, e, { value: Gg }),
						info: ze({}, e, { value: Jg }),
						warn: ze({}, e, { value: Zg }),
						error: ze({}, e, { value: Yg }),
						group: ze({}, e, { value: Xg }),
						groupCollapsed: ze({}, e, { value: Kg }),
						groupEnd: ze({}, e, { value: ey })
					});
				}
				0 > Yf && console.error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
			}
			function vu(e) {
				var n = Error.prepareStackTrace;
				if (Error.prepareStackTrace = void 0, e = e.stack, Error.prepareStackTrace = n, e.startsWith(`Error: react-stack-top-frame
`) && (e = e.slice(29)), n = e.indexOf(`
`), n !== -1 && (e = e.slice(n + 1)), n = e.indexOf("react_stack_bottom_frame"), n !== -1 && (n = e.lastIndexOf(`
`, n)), n !== -1) e = e.slice(0, n);
				else return "";
				return e;
			}
			function dt(e) {
				if (Km === void 0) try {
					throw Error();
				} catch (o) {
					var n = o.stack.trim().match(/\n( *(at )?)/);
					Km = n && n[1] || "", ny = -1 < o.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < o.stack.indexOf("@") ? "@unknown:0:0" : "";
				}
				return `
` + Km + e + ny;
			}
			function Su(e, n) {
				if (!e || eg) return "";
				var o = ng.get(e);
				if (o !== void 0) return o;
				eg = !0, o = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
				var i = null;
				i = x.H, x.H = null, Ip();
				try {
					var s = { DetermineComponentFrameRoot: function() {
						try {
							if (n) {
								var I = function() {
									throw Error();
								};
								if (Object.defineProperty(I.prototype, "props", { set: function() {
									throw Error();
								} }), typeof Reflect == "object" && Reflect.construct) {
									try {
										Reflect.construct(I, []);
									} catch (K) {
										var O = K;
									}
									Reflect.construct(e, [], I);
								} else {
									try {
										I.call();
									} catch (K) {
										O = K;
									}
									e.call(I.prototype);
								}
							} else {
								try {
									throw Error();
								} catch (K) {
									O = K;
								}
								(I = e()) && typeof I.catch == "function" && I.catch(function() {});
							}
						} catch (K) {
							if (K && O && typeof K.stack == "string") return [K.stack, O.stack];
						}
						return [null, null];
					} };
					s.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
					var u = Object.getOwnPropertyDescriptor(s.DetermineComponentFrameRoot, "name");
					u && u.configurable && Object.defineProperty(s.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
					var f = s.DetermineComponentFrameRoot(), p = f[0], g = f[1];
					if (p && g) {
						var S = p.split(`
`), T = g.split(`
`);
						for (f = u = 0; u < S.length && !S[u].includes("DetermineComponentFrameRoot");) u++;
						for (; f < T.length && !T[f].includes("DetermineComponentFrameRoot");) f++;
						if (u === S.length || f === T.length) for (u = S.length - 1, f = T.length - 1; 1 <= u && 0 <= f && S[u] !== T[f];) f--;
						for (; 1 <= u && 0 <= f; u--, f--) if (S[u] !== T[f]) {
							if (u !== 1 || f !== 1) do
								if (u--, f--, 0 > f || S[u] !== T[f]) {
									var _ = `
` + S[u].replace(" at new ", " at ");
									return e.displayName && _.includes("<anonymous>") && (_ = _.replace("<anonymous>", e.displayName)), typeof e == "function" && ng.set(e, _), _;
								}
							while (1 <= u && 0 <= f);
							break;
						}
					}
				} finally {
					eg = !1, x.H = i, Lp(), Error.prepareStackTrace = o;
				}
				return S = (S = e ? e.displayName || e.name : "") ? dt(S) : "", typeof e == "function" && ng.set(e, S), S;
			}
			function Lm(e, n) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5: return dt(e.type);
					case 16: return dt("Lazy");
					case 13: return e.child !== n && n !== null ? dt("Suspense Fallback") : dt("Suspense");
					case 19: return dt("SuspenseList");
					case 0:
					case 15: return Su(e.type, !1);
					case 11: return Su(e.type.render, !1);
					case 1: return Su(e.type, !0);
					case 31: return dt("Activity");
					default: return "";
				}
			}
			function ku(e) {
				try {
					var n = "", o = null;
					do {
						n += Lm(e, o);
						var i = e._debugInfo;
						if (i) for (var s = i.length - 1; 0 <= s; s--) {
							var u = i[s];
							if (typeof u.name == "string") {
								var f = n;
								e: {
									var p = u.name, g = u.env, S = u.debugLocation;
									if (S != null) {
										var T = vu(S), _ = T.lastIndexOf(`
`), I = _ === -1 ? T : T.slice(_ + 1);
										if (I.indexOf(p) !== -1) {
											var O = `
` + I;
											break e;
										}
									}
									O = dt(p + (g ? " [" + g + "]" : ""));
								}
								n = f + O;
							}
						}
						o = e, e = e.return;
					} while (e);
					return n;
				} catch (K) {
					return `
Error generating stack: ` + K.message + `
` + K.stack;
				}
			}
			function Np(e) {
				return (e = e ? e.displayName || e.name : "") ? dt(e) : "";
			}
			function ft(e, n) {
				if (typeof e == "object" && e !== null) {
					var o = tg.get(e);
					return o !== void 0 ? o : (n = {
						value: e,
						source: n,
						stack: ku(n)
					}, tg.set(e, n), n);
				}
				return {
					value: e,
					source: n,
					stack: ku(n)
				};
			}
			function ho(e, n) {
				mo(), rd[od++] = Xf, rd[od++] = Vh, Vh = e, Xf = n;
			}
			function wu(e, n, o) {
				mo(), to[ro++] = ui, to[ro++] = ci, to[ro++] = Gs, Gs = e;
				var i = ui;
				e = ci;
				var s = 32 - vn(i) - 1;
				i &= ~(1 << s), o += 1;
				var u = 32 - vn(n) + s;
				if (30 < u) {
					var f = s - s % 5;
					u = (i & (1 << f) - 1).toString(32), i >>= f, s -= f, ui = 1 << 32 - vn(n) + s | o << s | i, ci = u + e;
				} else ui = 1 << u | o << s | i, ci = e;
			}
			function Ei(e) {
				mo(), e.return !== null && (ho(e, 1), wu(e, 1, 0));
			}
			function Pu(e) {
				for (; e === Vh;) Vh = rd[--od], rd[od] = null, Xf = rd[--od], rd[od] = null;
				for (; e === Gs;) Gs = to[--ro], to[ro] = null, ci = to[--ro], to[ro] = null, ui = to[--ro], to[ro] = null;
			}
			function Ul() {
				return mo(), Gs !== null ? {
					id: ui,
					overflow: ci
				} : null;
			}
			function Hd(e, n) {
				mo(), to[ro++] = ui, to[ro++] = ci, to[ro++] = Gs, ui = n.id, ci = n.overflow, Gs = e;
			}
			function mo() {
				ge || console.error("Expected to be hydrating. This is a bug in React. Please file an issue.");
			}
			function pt(e) {
				return e === null && console.error("Expected host context to exist. This error is likely caused by a bug in React. Please file an issue."), e;
			}
			function Bl(e, n) {
				pe(Sl, n, e), pe(Kf, e, e), pe(vl, null, e), n = Zr(n), Ze(vl, e), pe(vl, n, e);
			}
			function Ia(e) {
				Ze(vl, e), Ze(Kf, e), Ze(Sl, e);
			}
			function Rt() {
				return pt(vl.current);
			}
			function La(e) {
				e.memoizedState !== null && pe(qh, e, e);
				var n = pt(vl.current), o = Dn(n, e.type);
				n !== o && (pe(Kf, e, e), pe(vl, o, e));
			}
			function Na(e) {
				Kf.current === e && (Ze(vl, e), Ze(Kf, e)), qh.current === e && (Ze(qh, e), at ? Kt._currentValue = Xt : Kt._currentValue2 = Xt);
			}
			function Ad(e, n) {
				return e.serverProps === void 0 && e.serverTail.length === 0 && e.children.length === 1 && 3 < e.distanceFromLeaf && e.distanceFromLeaf > 15 - n ? Ad(e.children[0], n) : e;
			}
			function Bn(e) {
				return "  " + "  ".repeat(e);
			}
			function go(e) {
				return "+ " + "  ".repeat(e);
			}
			function yo(e) {
				return "- " + "  ".repeat(e);
			}
			function Ko(e) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5: return e.type;
					case 16: return "Lazy";
					case 31: return "Activity";
					case 13: return "Suspense";
					case 19: return "SuspenseList";
					case 0:
					case 15: return e = e.type, e.displayName || e.name || null;
					case 11: return e = e.type.render, e.displayName || e.name || null;
					case 1: return e = e.type, e.displayName || e.name || null;
					default: return null;
				}
			}
			function Ii(e, n) {
				return ty.test(e) ? (e = JSON.stringify(e), e.length > n - 2 ? 8 > n ? "{\"...\"}" : "{" + e.slice(0, n - 7) + "...\"}" : "{" + e + "}") : e.length > n ? 5 > n ? "{\"...\"}" : e.slice(0, n - 3) + "..." : e;
			}
			function Fa(e, n, o) {
				var i = 120 - 2 * o;
				if (n === null) return go(o) + Ii(e, i) + `
`;
				if (typeof n == "string") {
					for (var s = 0; s < n.length && s < e.length && n.charCodeAt(s) === e.charCodeAt(s); s++);
					return s > i - 8 && 10 < s && (e = "..." + e.slice(s - 8), n = "..." + n.slice(s - 8)), go(o) + Ii(e, i) + `
` + yo(o) + Ii(n, i) + `
`;
				}
				return Bn(o) + Ii(e, i) + `
`;
			}
			function Ol(e) {
				return Object.prototype.toString.call(e).replace(/^\[object (.*)\]$/, function(n, o) {
					return o;
				});
			}
			function Ha(e, n) {
				switch (typeof e) {
					case "string": return e = JSON.stringify(e), e.length > n ? 5 > n ? "\"...\"" : e.slice(0, n - 4) + "...\"" : e;
					case "object":
						if (e === null) return "null";
						if (fn(e)) return "[...]";
						if (e.$$typeof === Ho) return (n = $e(e.type)) ? "<" + n + ">" : "<...>";
						var o = Ol(e);
						if (o === "Object") {
							o = "", n -= 2;
							for (var i in e) if (e.hasOwnProperty(i)) {
								var s = JSON.stringify(i);
								if (s !== "\"" + i + "\"" && (i = s), n -= i.length - 2, s = Ha(e[i], 15 > n ? n : 15), n -= s.length, 0 > n) {
									o += o === "" ? "..." : ", ...";
									break;
								}
								o += (o === "" ? "" : ",") + i + ":" + s;
							}
							return "{" + o + "}";
						}
						return o;
					case "function": return (n = e.displayName || e.name) ? "function " + n : "function";
					default: return String(e);
				}
			}
			function Et(e, n) {
				return typeof e != "string" || ty.test(e) ? "{" + Ha(e, n - 2) + "}" : e.length > n - 2 ? 5 > n ? "\"...\"" : "\"" + e.slice(0, n - 5) + "...\"" : "\"" + e + "\"";
			}
			function Nr(e, n, o) {
				var i = 120 - o.length - e.length, s = [], u;
				for (u in n) if (n.hasOwnProperty(u) && u !== "children") {
					var f = Et(n[u], 120 - o.length - u.length - 1);
					i -= u.length + f.length + 2, s.push(u + "=" + f);
				}
				return s.length === 0 ? o + "<" + e + `>
` : 0 < i ? o + "<" + e + " " + s.join(" ") + `>
` : o + "<" + e + `
` + o + "  " + s.join(`
` + o + "  ") + `
` + o + `>
`;
			}
			function Ml(e, n, o) {
				var i = "", s = ze({}, n), u;
				for (u in e) if (e.hasOwnProperty(u)) {
					delete s[u];
					var f = 120 - 2 * o - u.length - 2, p = Ha(e[u], f);
					n.hasOwnProperty(u) ? (f = Ha(n[u], f), i += go(o) + u + ": " + p + `
`, i += yo(o) + u + ": " + f + `
`) : i += go(o) + u + ": " + p + `
`;
				}
				for (var g in s) s.hasOwnProperty(g) && (e = Ha(s[g], 120 - 2 * o - g.length - 2), i += yo(o) + g + ": " + e + `
`);
				return i;
			}
			function jd(e, n, o, i) {
				var s = "", u = /* @__PURE__ */ new Map();
				for (S in o) o.hasOwnProperty(S) && u.set(S.toLowerCase(), S);
				if (u.size === 1 && u.has("children")) s += Nr(e, n, Bn(i));
				else {
					for (var f in n) if (n.hasOwnProperty(f) && f !== "children") {
						var p = 120 - 2 * (i + 1) - f.length - 1, g = u.get(f.toLowerCase());
						if (g !== void 0) {
							u.delete(f.toLowerCase());
							var S = n[f];
							g = o[g];
							var T = Et(S, p);
							p = Et(g, p), typeof S == "object" && S !== null && typeof g == "object" && g !== null && Ol(S) === "Object" && Ol(g) === "Object" && (2 < Object.keys(S).length || 2 < Object.keys(g).length || -1 < T.indexOf("...") || -1 < p.indexOf("...")) ? s += Bn(i + 1) + f + `={{
` + Ml(S, g, i + 2) + Bn(i + 1) + `}}
` : (s += go(i + 1) + f + "=" + T + `
`, s += yo(i + 1) + f + "=" + p + `
`);
						} else s += Bn(i + 1) + f + "=" + Et(n[f], p) + `
`;
					}
					u.forEach(function(_) {
						if (_ !== "children") {
							var I = 120 - 2 * (i + 1) - _.length - 1;
							s += yo(i + 1) + _ + "=" + Et(o[_], I) + `
`;
						}
					}), s = s === "" ? Bn(i) + "<" + e + `>
` : Bn(i) + "<" + e + `
` + s + Bn(i) + `>
`;
				}
				return e = o.children, n = n.children, typeof e == "string" || typeof e == "number" || typeof e == "bigint" ? (u = "", (typeof n == "string" || typeof n == "number" || typeof n == "bigint") && (u = "" + n), s += Fa(u, "" + e, i + 1)) : (typeof n == "string" || typeof n == "number" || typeof n == "bigint") && (s = e == null ? s + Fa("" + n, null, i + 1) : s + Fa("" + n, void 0, i + 1)), s;
			}
			function Li(e, n) {
				var o = Ko(e);
				if (o === null) {
					for (o = "", e = e.child; e;) o += Li(e, n), e = e.sibling;
					return o;
				}
				return Bn(n) + "<" + o + `>
`;
			}
			function Aa(e, n) {
				var o = Ad(e, n);
				if (o !== e && (e.children.length !== 1 || e.children[0] !== o)) return Bn(n) + `...
` + Aa(o, n + 1);
				o = "";
				var i = e.fiber._debugInfo;
				if (i) for (var s = 0; s < i.length; s++) {
					var u = i[s].name;
					typeof u == "string" && (o += Bn(n) + "<" + u + `>
`, n++);
				}
				if (i = "", s = e.fiber.pendingProps, e.fiber.tag === 6) i = Fa(s, e.serverProps, n), n++;
				else if (u = Ko(e.fiber), u !== null) if (e.serverProps === void 0) {
					i = n;
					var f = 120 - 2 * i - u.length - 2, p = "";
					for (S in s) if (s.hasOwnProperty(S) && S !== "children") {
						var g = Et(s[S], 15);
						if (f -= S.length + g.length + 2, 0 > f) {
							p += " ...";
							break;
						}
						p += " " + S + "=" + g;
					}
					i = Bn(i) + "<" + u + p + `>
`, n++;
				} else e.serverProps === null ? (i = Nr(u, s, go(n)), n++) : typeof e.serverProps == "string" ? console.error("Should not have matched a non HostText fiber to a Text node. This is a bug in React.") : (i = jd(u, s, e.serverProps, n), n++);
				var S = "";
				for (s = e.fiber.child, u = 0; s && u < e.children.length;) f = e.children[u], f.fiber === s ? (S += Aa(f, n), u++) : S += Li(s, n), s = s.sibling;
				for (s && 0 < e.children.length && (S += Bn(n) + `...
`), s = e.serverTail, e.serverProps === null && n--, e = 0; e < s.length; e++) u = s[e], S = typeof u == "string" ? S + (yo(n) + Ii(u, 120 - 2 * n) + `
`) : S + Nr(u.type, u.props, yo(n));
				return o + i + S;
			}
			function Dd(e) {
				try {
					return `

` + Aa(e, 0);
				} catch {
					return "";
				}
			}
			function Fp() {
				if (di === null) return "";
				var e = di;
				try {
					var n = "";
					switch (e.tag === 6 && (e = e.return), e.tag) {
						case 26:
						case 27:
						case 5:
							n += dt(e.type);
							break;
						case 13:
							n += dt("Suspense");
							break;
						case 19:
							n += dt("SuspenseList");
							break;
						case 31:
							n += dt("Activity");
							break;
						case 30:
						case 0:
						case 15:
						case 1:
							e._debugOwner || n !== "" || (n += Np(e.type));
							break;
						case 11: e._debugOwner || n !== "" || (n += Np(e.type.render));
					}
					for (; e;) if (typeof e.tag == "number") {
						var o = e;
						e = o._debugOwner;
						var i = o._debugStack;
						if (e && i) {
							var s = vu(i);
							s !== "" && (n += `
` + s);
						}
					} else if (e.debugStack != null) {
						var u = e.debugStack;
						(e = e.owner) && u && (n += `
` + vu(u));
					} else break;
					var f = n;
				} catch (p) {
					f = `
Error generating stack: ` + p.message + `
` + p.stack;
				}
				return f;
			}
			function B(e, n, o, i, s, u, f) {
				var p = di;
				Ql(e);
				try {
					return e !== null && e._debugTask ? e._debugTask.run(n.bind(null, o, i, s, u, f)) : n(o, i, s, u, f);
				} finally {
					Ql(p);
				}
				throw Error("runWithFiberInDEV should never be called in production. This is a bug in React.");
			}
			function Ql(e) {
				x.getCurrentStack = e === null ? null : Fp, Pa = !1, di = e;
			}
			function bo(e, n) {
				if (e.return === null) {
					if (Tr === null) Tr = {
						fiber: e,
						children: [],
						serverProps: void 0,
						serverTail: [],
						distanceFromLeaf: n
					};
					else {
						if (Tr.fiber !== e) throw Error("Saw multiple hydration diff roots in a pass. This is a bug in React.");
						Tr.distanceFromLeaf > n && (Tr.distanceFromLeaf = n);
					}
					return Tr;
				}
				var o = bo(e.return, n + 1).children;
				return 0 < o.length && o[o.length - 1].fiber === e ? (o = o[o.length - 1], o.distanceFromLeaf > n && (o.distanceFromLeaf = n), o) : (n = {
					fiber: e,
					children: [],
					serverProps: void 0,
					serverTail: [],
					distanceFromLeaf: n
				}, o.push(n), n);
			}
			function vo() {
				ge && console.error("We should not be hydrating here. This is a bug in React. Please file a bug.");
			}
			function Ni(e, n) {
				xa || (e = bo(e, 0), e.serverProps = null, n !== null && (n = ml(n), e.serverTail.push(n)));
			}
			function Fr(e) {
				var n = 1 < arguments.length && arguments[1] !== void 0 ? arguments[1] : !1, o = "", i = Tr;
				throw i !== null && (Tr = null, o = Dd(i)), Fi(ft(Error("Hydration failed because the server rendered " + (n ? "text" : "HTML") + ` didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch` + o), e)), rg;
			}
			function So(e, n) {
				if (!qn) throw Error("Expected prepareToHydrateHostInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
				de(e.stateNode, e.type, e.memoizedProps, n, e) || Fr(e, !0);
			}
			function ht(e) {
				for (it = e.return; it;) switch (it.tag) {
					case 5:
					case 31:
					case 13:
						oo = !1;
						return;
					case 27:
					case 3:
						oo = !0;
						return;
					default: it = it.return;
				}
			}
			function ko(e) {
				if (!qn || e !== it) return !1;
				if (!ge) return ht(e), ge = !0, !1;
				var n = e.tag;
				if (d ? n !== 3 && n !== 27 && (n !== 5 || Yc(e.type) && !ue(e.type, e.memoizedProps)) && Ke && (Ve(e), Fr(e)) : n !== 3 && (n !== 5 || Yc(e.type) && !ue(e.type, e.memoizedProps)) && Ke && (Ve(e), Fr(e)), ht(e), n === 13) {
					if (!qn) throw Error("Expected skipPastDehydratedSuspenseInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
					if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
					Ke = ai(e);
				} else if (n === 31) {
					if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
					Ke = ya(e);
				} else Ke = d && n === 27 ? Zm(e.type, Ke) : it ? ga(e.stateNode) : null;
				return !0;
			}
			function Ve(e) {
				for (var n = Ke; n;) {
					var o = bo(e, 0), i = ml(n);
					o.serverTail.push(i), n = i.type === "Suspense" ? ai(n) : ga(n);
				}
			}
			function wo() {
				qn && (Ke = it = null, xa = ge = !1);
			}
			function $l() {
				var e = kl;
				return e !== null && (Bt === null ? Bt = e : Bt.push.apply(Bt, e), kl = null), e;
			}
			function Fi(e) {
				kl === null ? kl = [e] : kl.push(e);
			}
			function xu() {
				var e = Tr;
				if (e !== null) {
					Tr = null;
					for (var n = Dd(e); 0 < e.children.length;) e = e.children[0];
					B(e.fiber, function() {
						console.error(`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

%s%s`, "https://react.dev/link/hydration-mismatch", n);
					});
				}
			}
			function zu() {
				ad = Zh = null, id = !1;
			}
			function Hr(e, n, o) {
				at ? (pe(Gh, n._currentValue, e), n._currentValue = o, pe(og, n._currentRenderer, e), n._currentRenderer !== void 0 && n._currentRenderer !== null && n._currentRenderer !== Jh && console.error("Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."), n._currentRenderer = Jh) : (pe(Gh, n._currentValue2, e), n._currentValue2 = o, pe(ag, n._currentRenderer2, e), n._currentRenderer2 !== void 0 && n._currentRenderer2 !== null && n._currentRenderer2 !== Jh && console.error("Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."), n._currentRenderer2 = Jh);
			}
			function lr(e, n) {
				var o = Gh.current;
				at ? (e._currentValue = o, o = og.current, Ze(og, n), e._currentRenderer = o) : (e._currentValue2 = o, o = ag.current, Ze(ag, n), e._currentRenderer2 = o), Ze(Gh, n);
			}
			function Vl(e, n, o) {
				for (; e !== null;) {
					var i = e.alternate;
					if ((e.childLanes & n) !== n ? (e.childLanes |= n, i !== null && (i.childLanes |= n)) : i !== null && (i.childLanes & n) !== n && (i.childLanes |= n), e === o) break;
					e = e.return;
				}
				e !== o && console.error("Expected to find the propagation root when scheduling context work. This error is likely caused by a bug in React. Please file an issue.");
			}
			function Ln(e, n, o, i) {
				var s = e.child;
				for (s !== null && (s.return = e); s !== null;) {
					var u = s.dependencies;
					if (u !== null) {
						var f = s.child;
						u = u.firstContext;
						e: for (; u !== null;) {
							var p = u;
							u = s;
							for (var g = 0; g < n.length; g++) if (p.context === n[g]) {
								u.lanes |= o, p = u.alternate, p !== null && (p.lanes |= o), Vl(u.return, o, e), i || (f = null);
								break e;
							}
							u = p.next;
						}
					} else if (s.tag === 18) {
						if (f = s.return, f === null) throw Error("We just came from a parent so we must have had a parent. This is a bug in React.");
						f.lanes |= o, u = f.alternate, u !== null && (u.lanes |= o), Vl(f, o, e), f = null;
					} else f = s.child;
					if (f !== null) f.return = s;
					else for (f = s; f !== null;) {
						if (f === e) {
							f = null;
							break;
						}
						if (s = f.sibling, s !== null) {
							s.return = f.return, f = s;
							break;
						}
						f = f.return;
					}
					s = f;
				}
			}
			function He(e, n, o, i) {
				e = null;
				for (var s = n, u = !1; s !== null;) {
					if (!u) {
						if ((s.flags & 524288) !== 0) u = !0;
						else if ((s.flags & 262144) !== 0) break;
					}
					if (s.tag === 10) {
						var f = s.alternate;
						if (f === null) throw Error("Should have a current fiber. This is a bug in React.");
						if (f = f.memoizedProps, f !== null) {
							var p = s.type;
							jt(s.pendingProps.value, f.value) || (e !== null ? e.push(p) : e = [p]);
						}
					} else if (s === qh.current) {
						if (f = s.alternate, f === null) throw Error("Should have a current fiber. This is a bug in React.");
						f.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Kt) : e = [Kt]);
					}
					s = s.return;
				}
				e !== null && Ln(n, e, o, i), n.flags |= 262144;
			}
			function ja(e) {
				for (e = e.firstContext; e !== null;) {
					var n = e.context;
					if (!jt(at ? n._currentValue : n._currentValue2, e.memoizedValue)) return !0;
					e = e.next;
				}
				return !1;
			}
			function sr(e) {
				Zh = e, ad = null, e = e.dependencies, e !== null && (e.firstContext = null);
			}
			function Ee(e) {
				return id && console.error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."), Ar(Zh, e);
			}
			function Hi(e, n) {
				return Zh === null && sr(e), Ar(e, n);
			}
			function Ar(e, n) {
				var o = at ? n._currentValue : n._currentValue2;
				if (n = {
					context: n,
					memoizedValue: o,
					next: null
				}, ad === null) {
					if (e === null) throw Error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
					ad = n, e.dependencies = {
						lanes: 0,
						firstContext: n,
						_debugThenableState: null
					}, e.flags |= 524288;
				} else ad = ad.next = n;
				return o;
			}
			function Ai() {
				return {
					controller: new jb(),
					data: /* @__PURE__ */ new Map(),
					refCount: 0
				};
			}
			function Po(e) {
				e.controller.signal.aborted && console.warn("A cache instance was retained after it was already freed. This likely indicates a bug in React."), e.refCount++;
			}
			function Da(e) {
				e.refCount--, 0 > e.refCount && console.warn("A cache instance was released after it was already freed. This likely indicates a bug in React."), e.refCount === 0 && Db(Wb, function() {
					e.controller.abort();
				});
			}
			function ur(e, n, o) {
				(e & 127) !== 0 ? 0 > za && (za = xn(), ep = Yh(n), ig = n, o != null && (lg = G(o)), Ns() && (cn = !0, Pl = 1), e = Pr(), n = ti(), e !== ld || n !== np ? ld = -1.1 : n !== null && (Pl = 1), Ys = e, np = n) : e & 4194048 && 0 > ao && (ao = xn(), tp = Yh(n), ry = n, o != null && (oy = G(o)), 0 > mi) && (e = Pr(), n = ti(), (e !== zl || n !== Xs) && (zl = -1.1), xl = e, Xs = n);
			}
			function Hp(e) {
				if (0 > za) {
					za = xn(), ep = e._debugTask != null ? e._debugTask : null, Ns() && (Pl = 1);
					var n = Pr(), o = ti();
					n !== ld || o !== np ? ld = -1.1 : o !== null && (Pl = 1), Ys = n, np = o;
				}
				0 > ao && (ao = xn(), tp = e._debugTask != null ? e._debugTask : null, 0 > mi) && (e = Pr(), n = ti(), (e !== zl || n !== Xs) && (zl = -1.1), xl = e, Xs = n);
			}
			function jr() {
				var e = Js;
				return Js = 0, e;
			}
			function ql(e) {
				var n = Js;
				return Js = e, n;
			}
			function ji(e) {
				var n = Js;
				return Js += e, n;
			}
			function Gl() {
				q = $ = -1.1;
			}
			function Xn() {
				var e = $;
				return $ = -1.1, e;
			}
			function mt(e) {
				0 <= e && ($ = e);
			}
			function Dr() {
				var e = en;
				return en = -0, e;
			}
			function cr(e) {
				0 <= e && (en = e);
			}
			function dr() {
				var e = Je;
				return Je = null, e;
			}
			function fr() {
				var e = cn;
				return cn = !1, e;
			}
			function Jl(e) {
				Dt = xn(), 0 > e.actualStartTime && (e.actualStartTime = Dt);
			}
			function Cu(e) {
				if (0 <= Dt) {
					var n = xn() - Dt;
					e.actualDuration += n, e.selfBaseDuration = n, Dt = -1;
				}
			}
			function Wd(e) {
				if (0 <= Dt) {
					var n = xn() - Dt;
					e.actualDuration += n, Dt = -1;
				}
			}
			function pr() {
				if (0 <= Dt) {
					var e = xn(), n = e - Dt;
					Dt = -1, Js += n, en += n, q = e;
				}
			}
			function Ud(e) {
				Je === null && (Je = []), Je.push(e), pi === null && (pi = []), pi.push(e);
			}
			function hr() {
				Dt = xn(), 0 > $ && ($ = Dt);
			}
			function Zl(e) {
				for (var n = e.child; n;) e.actualDuration += n.actualDuration, n = n.sibling;
			}
			function Yl() {}
			function Kn(e) {
				e !== ud && e.next === null && (ud === null ? tm = ud = e : ud = ud.next = e), rm = !0, x.actQueue !== null ? cg || (cg = !0, Od()) : ug || (ug = !0, Od());
			}
			function Wa(e, n) {
				if (!dg && rm) {
					dg = !0;
					do
						for (var o = !1, i = tm; i !== null;) {
							if (!n) if (e !== 0) {
								var s = i.pendingLanes;
								if (s === 0) var u = 0;
								else {
									var f = i.suspendedLanes, p = i.pingedLanes;
									u = (1 << 31 - vn(42 | e) + 1) - 1, u &= s & ~(f & ~p), u = u & 201326741 ? u & 201326741 | 1 : u ? u | 2 : 0;
								}
								u !== 0 && (o = !0, Ap(i, u));
							} else u = ae, u = zi(i, i === je ? u : 0, i.cancelPendingCommit !== null || i.timeoutHandle !== Yr), !(u & 3) || Hl(i, u) || (o = !0, Ap(i, u));
							i = i.next;
						}
					while (o);
					dg = !1;
				}
			}
			function Xl() {
				ll(), Di();
			}
			function Di() {
				rm = cg = ug = !1;
				var e = 0;
				Ks !== 0 && Us() && (e = Ks);
				for (var n = me(), o = null, i = tm; i !== null;) {
					var s = i.next, u = Bd(i, n);
					u === 0 ? (i.next = null, o === null ? tm = s : o.next = s, s === null && (ud = o)) : (o = i, (e !== 0 || u & 3) && (rm = !0)), i = s;
				}
				Rn !== Ll && Rn !== Cm || Wa(e, !1), Ks !== 0 && (Ks = 0);
			}
			function Bd(e, n) {
				for (var o = e.suspendedLanes, i = e.pingedLanes, s = e.expirationTimes, u = e.pendingLanes & -62914561; 0 < u;) {
					var f = 31 - vn(u), p = 1 << f, g = s[f];
					g === -1 ? ((p & o) === 0 || (p & i) !== 0) && (s[f] = Rp(p, n)) : g <= n && (e.expiredLanes |= p), u &= ~p;
				}
				if (n = je, o = ae, o = zi(e, e === n ? o : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== Yr), i = e.callbackNode, o === 0 || e === n && (Le === lu || Le === su) || e.cancelPendingCommit !== null) return i !== null && _u(i), e.callbackNode = null, e.callbackPriority = 0;
				if ((o & 3) === 0 || Hl(e, o)) {
					if (n = o & -o, n !== e.callbackPriority || x.actQueue !== null && i !== fg) _u(i);
					else return n;
					switch (ar(o)) {
						case 2:
						case 8:
							o = Oo;
							break;
						case 32:
							o = qs;
							break;
						case 268435456:
							o = Qg;
							break;
						default: o = qs;
					}
					return i = Tu.bind(null, e), x.actQueue !== null ? (x.actQueue.push(i), o = fg) : o = Q(o, i), e.callbackPriority = n, e.callbackNode = o, n;
				}
				return i !== null && _u(i), e.callbackPriority = 2, e.callbackNode = null, 2;
			}
			function Tu(e, n) {
				if (nm = em = !1, ll(), Rn !== Ll && Rn !== Cm) return e.callbackNode = null, e.callbackPriority = 0, null;
				var o = e.callbackNode;
				if (Go === zm && (Go = Ag), el() && e.callbackNode !== o) return null;
				var i = ae;
				return i = zi(e, e === je ? i : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== Yr), i === 0 ? null : (Lf(e, i, n), Bd(e, me()), e.callbackNode != null && e.callbackNode === o ? Tu.bind(null, e) : null);
			}
			function Ap(e, n) {
				if (el()) return null;
				em = nm, nm = !1, Lf(e, n, !0);
			}
			function _u(e) {
				e !== fg && e !== null && Ge(e);
			}
			function Od() {
				x.actQueue !== null && x.actQueue.push(function() {
					return Di(), null;
				}), Oh ? er(function() {
					(ye & (Zn | uo)) !== Jn ? Q(be, Xl) : Di();
				}) : Q(be, Xl);
			}
			function Ru() {
				if (Ks === 0) {
					var e = eu;
					e === 0 && (e = w, w <<= 1, !(w & 261888) && (w = 256)), Ks = e;
				}
				return Ks;
			}
			function jp(e, n) {
				if (op === null) {
					var o = op = [];
					pg = 0, eu = Ru(), cd = {
						status: "pending",
						value: void 0,
						then: function(i) {
							o.push(i);
						}
					};
				}
				return pg++, n.then(Md, Md), n;
			}
			function Md() {
				if (--pg === 0 && (-1 < ao || (mi = -1.1), op !== null)) {
					cd !== null && (cd.status = "fulfilled");
					var e = op;
					op = null, eu = 0, cd = null;
					for (var n = 0; n < e.length; n++) (0, e[n])();
				}
			}
			function Qd(e, n) {
				var o = [], i = {
					status: "pending",
					value: null,
					reason: null,
					then: function(s) {
						o.push(s);
					}
				};
				return e.then(function() {
					i.status = "fulfilled", i.value = n;
					for (var s = 0; s < o.length; s++) (0, o[s])(n);
				}, function(s) {
					for (i.status = "rejected", i.reason = s, s = 0; s < o.length; s++) (0, o[s])(void 0);
				}), i;
			}
			function Eu() {
				var e = nu.current;
				return e !== null ? e : je.pooledCache;
			}
			function Kl(e, n) {
				n === null ? pe(nu, nu.current, e) : pe(nu, n.pool, e);
			}
			function Iu() {
				var e = Eu();
				return e === null ? null : {
					parent: at ? un._currentValue : un._currentValue2,
					pool: e
				};
			}
			function es(e, n) {
				if (jt(e, n)) return !0;
				if (typeof e != "object" || e === null || typeof n != "object" || n === null) return !1;
				var o = Object.keys(e), i = Object.keys(n);
				if (o.length !== i.length) return !1;
				for (i = 0; i < o.length; i++) {
					var s = o[i];
					if (!Xm.call(n, s) || !jt(e[s], n[s])) return !1;
				}
				return !0;
			}
			function $d() {
				return {
					didWarnAboutUncachedPromise: !1,
					thenables: []
				};
			}
			function Vd(e) {
				return e = e.status, e === "fulfilled" || e === "rejected";
			}
			function Lu(e, n, o) {
				x.actQueue !== null && (x.didUsePromise = !0);
				var i = e.thenables;
				if (o = i[o], o === void 0 ? i.push(n) : o !== n && (e.didWarnAboutUncachedPromise || (e.didWarnAboutUncachedPromise = !0, console.error("A component was suspended by an uncached promise. Creating promises inside a Client Component or hook is not yet supported, except via a Suspense-compatible library or framework.")), n.then(Yl, Yl), n = o), n._debugInfo === void 0) {
					e = performance.now(), i = n.displayName;
					var s = {
						name: typeof i == "string" ? i : "Promise",
						start: e,
						end: e,
						value: n
					};
					n._debugInfo = [{ awaited: s }], n.status !== "fulfilled" && n.status !== "rejected" && (e = function() {
						s.end = performance.now();
					}, n.then(e, e));
				}
				switch (n.status) {
					case "fulfilled": return n.value;
					case "rejected": throw e = n.reason, Dp(e), e;
					default:
						if (typeof n.status == "string") n.then(Yl, Yl);
						else {
							if (e = je, e !== null && 100 < e.shellSuspendCounter) throw Error("An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.");
							e = n, e.status = "pending", e.then(function(u) {
								if (n.status === "pending") {
									var f = n;
									f.status = "fulfilled", f.value = u;
								}
							}, function(u) {
								if (n.status === "pending") {
									var f = n;
									f.status = "rejected", f.reason = u;
								}
							});
						}
						switch (n.status) {
							case "fulfilled": return n.value;
							case "rejected": throw e = n.reason, Dp(e), e;
						}
						throw ru = n, dp = !0, dd;
				}
			}
			function xo(e) {
				try {
					return Mb(e);
				} catch (n) {
					throw n !== null && typeof n == "object" && typeof n.then == "function" ? (ru = n, dp = !0, dd) : n;
				}
			}
			function qd() {
				if (ru === null) throw Error("Expected a suspended thenable. This is a bug in React. Please file an issue.");
				var e = ru;
				return ru = null, dp = !1, e;
			}
			function Dp(e) {
				if (e === dd || e === am) throw Error("Hooks are not supported inside an async component. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.");
			}
			function Nn(e) {
				var n = oe;
				return e != null && (oe = n === null ? e : n.concat(e)), n;
			}
			function Nu() {
				var e = oe;
				if (e != null) {
					for (var n = e.length - 1; 0 <= n; n--) if (e[n].name != null) {
						var o = e[n].debugTask;
						if (o != null) return o;
					}
				}
				return null;
			}
			function ea(e, n, o) {
				for (var i = Object.keys(e.props), s = 0; s < i.length; s++) {
					var u = i[s];
					if (u !== "children" && u !== "key") {
						n === null && (n = Rc(e, o.mode, 0), n._debugInfo = oe, n.return = o), B(n, function(f) {
							console.error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", f);
						}, u);
						break;
					}
				}
			}
			function Wi(e) {
				var n = fp;
				return fp += 1, fd === null && (fd = $d()), Lu(fd, e, n);
			}
			function na(e, n) {
				n = n.props.ref, e.ref = n !== void 0 ? n : null;
			}
			function Gd(e, n) {
				throw n.$$typeof === Uh ? Error(`A React Element from an older version of React was rendered. This is not supported. It can happen if:
- Multiple copies of the "react" package is used.
- A library pre-bundled an old copy of "react" or "react/jsx-runtime".
- A compiler tries to "inline" JSX instead of using the runtime.`) : (e = Object.prototype.toString.call(n), Error("Objects are not valid as a React child (found: " + (e === "[object Object]" ? "object with keys {" + Object.keys(n).join(", ") + "}" : e) + "). If you meant to render a collection of children, use an array instead."));
			}
			function ns(e, n) {
				var o = Nu();
				o !== null ? o.run(Gd.bind(null, e, n)) : Gd(e, n);
			}
			function Fu(e, n) {
				var o = G(e) || "Component";
				wy[o] || (wy[o] = !0, n = n.displayName || n.name || "Component", e.tag === 3 ? console.error(`Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.
  root.render(%s)`, n, n, n) : console.error(`Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.
  <%s>{%s}</%s>`, n, n, o, n, o));
			}
			function ts(e, n) {
				var o = Nu();
				o !== null ? o.run(Fu.bind(null, e, n)) : Fu(e, n);
			}
			function Jd(e, n) {
				var o = G(e) || "Component";
				Py[o] || (Py[o] = !0, n = String(n), e.tag === 3 ? console.error(`Symbols are not valid as a React child.
  root.render(%s)`, n) : console.error(`Symbols are not valid as a React child.
  <%s>%s</%s>`, o, n, o));
			}
			function Wr(e, n) {
				var o = Nu();
				o !== null ? o.run(Jd.bind(null, e, n)) : Jd(e, n);
			}
			function rs(e) {
				function n(b, v) {
					if (e) {
						var k = b.deletions;
						k === null ? (b.deletions = [v], b.flags |= 16) : k.push(v);
					}
				}
				function o(b, v) {
					if (!e) return null;
					for (; v !== null;) n(b, v), v = v.sibling;
					return null;
				}
				function i(b) {
					for (var v = /* @__PURE__ */ new Map(); b !== null;) b.key !== null ? v.set(b.key, b) : v.set(b.index, b), b = b.sibling;
					return v;
				}
				function s(b, v) {
					return b = Fo(b, v), b.index = 0, b.sibling = null, b;
				}
				function u(b, v, k) {
					return b.index = k, e ? (k = b.alternate, k !== null ? (k = k.index, k < v ? (b.flags |= 67108866, v) : k) : (b.flags |= 67108866, v)) : (b.flags |= 1048576, v);
				}
				function f(b) {
					return e && b.alternate === null && (b.flags |= 67108866), b;
				}
				function p(b, v, k, E) {
					return v === null || v.tag !== 6 ? (v = Ec(k, b.mode, E), v.return = b, v._debugOwner = b, v._debugTask = b._debugTask, v._debugInfo = oe, v) : (v = s(v, k), v.return = b, v._debugInfo = oe, v);
				}
				function g(b, v, k, E) {
					var U = k.type;
					return U === ol ? (v = T(b, v, k.props.children, E, k.key), ea(k, v, b), v) : v !== null && (v.elementType === U || Wf(v, k) || typeof U == "object" && U !== null && U.$$typeof === kt && xo(U) === v.type) ? (v = s(v, k.props), na(v, k), v.return = b, v._debugOwner = k._owner, v._debugInfo = oe, v) : (v = Rc(k, b.mode, E), na(v, k), v.return = b, v._debugInfo = oe, v);
				}
				function S(b, v, k, E) {
					return v === null || v.tag !== 4 || v.stateNode.containerInfo !== k.containerInfo || v.stateNode.implementation !== k.implementation ? (v = Hs(k, b.mode, E), v.return = b, v._debugInfo = oe, v) : (v = s(v, k.children || []), v.return = b, v._debugInfo = oe, v);
				}
				function T(b, v, k, E, U) {
					return v === null || v.tag !== 7 ? (v = fa(k, b.mode, E, U), v.return = b, v._debugOwner = b, v._debugTask = b._debugTask, v._debugInfo = oe, v) : (v = s(v, k), v.return = b, v._debugInfo = oe, v);
				}
				function _(b, v, k) {
					if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = Ec("" + v, b.mode, k), v.return = b, v._debugOwner = b, v._debugTask = b._debugTask, v._debugInfo = oe, v;
					if (typeof v == "object" && v !== null) {
						switch (v.$$typeof) {
							case Ho: return k = Rc(v, b.mode, k), na(k, v), k.return = b, b = Nn(v._debugInfo), k._debugInfo = oe, oe = b, k;
							case Ao: return v = Hs(v, b.mode, k), v.return = b, v._debugInfo = oe, v;
							case kt:
								var E = Nn(v._debugInfo);
								return v = xo(v), b = _(b, v, k), oe = E, b;
						}
						if (fn(v) || Yo(v)) return k = fa(v, b.mode, k, null), k.return = b, k._debugOwner = b, k._debugTask = b._debugTask, b = Nn(v._debugInfo), k._debugInfo = oe, oe = b, k;
						if (typeof v.then == "function") return E = Nn(v._debugInfo), b = _(b, Wi(v), k), oe = E, b;
						if (v.$$typeof === on) return _(b, Hi(b, v), k);
						ns(b, v);
					}
					return typeof v == "function" && ts(b, v), typeof v == "symbol" && Wr(b, v), null;
				}
				function I(b, v, k, E) {
					var U = v !== null ? v.key : null;
					if (typeof k == "string" && k !== "" || typeof k == "number" || typeof k == "bigint") return U !== null ? null : p(b, v, "" + k, E);
					if (typeof k == "object" && k !== null) {
						switch (k.$$typeof) {
							case Ho: return k.key === U ? (U = Nn(k._debugInfo), b = g(b, v, k, E), oe = U, b) : null;
							case Ao: return k.key === U ? S(b, v, k, E) : null;
							case kt: return U = Nn(k._debugInfo), k = xo(k), b = I(b, v, k, E), oe = U, b;
						}
						if (fn(k) || Yo(k)) return U !== null ? null : (U = Nn(k._debugInfo), b = T(b, v, k, E, null), oe = U, b);
						if (typeof k.then == "function") return U = Nn(k._debugInfo), b = I(b, v, Wi(k), E), oe = U, b;
						if (k.$$typeof === on) return I(b, v, Hi(b, k), E);
						ns(b, k);
					}
					return typeof k == "function" && ts(b, k), typeof k == "symbol" && Wr(b, k), null;
				}
				function O(b, v, k, E, U) {
					if (typeof E == "string" && E !== "" || typeof E == "number" || typeof E == "bigint") return b = b.get(k) || null, p(v, b, "" + E, U);
					if (typeof E == "object" && E !== null) {
						switch (E.$$typeof) {
							case Ho: return k = b.get(E.key === null ? k : E.key) || null, b = Nn(E._debugInfo), v = g(v, k, E, U), oe = b, v;
							case Ao: return b = b.get(E.key === null ? k : E.key) || null, S(v, b, E, U);
							case kt:
								var ke = Nn(E._debugInfo);
								return E = xo(E), v = O(b, v, k, E, U), oe = ke, v;
						}
						if (fn(E) || Yo(E)) return k = b.get(k) || null, b = Nn(E._debugInfo), v = T(v, k, E, U, null), oe = b, v;
						if (typeof E.then == "function") return ke = Nn(E._debugInfo), v = O(b, v, k, Wi(E), U), oe = ke, v;
						if (E.$$typeof === on) return O(b, v, k, Hi(v, E), U);
						ns(v, E);
					}
					return typeof E == "function" && ts(v, E), typeof E == "symbol" && Wr(v, E), null;
				}
				function K(b, v, k, E) {
					if (typeof k != "object" || k === null) return E;
					switch (k.$$typeof) {
						case Ho:
						case Ao:
							Zo(b, v, k);
							var U = k.key;
							if (typeof U != "string") break;
							if (E === null) {
								E = /* @__PURE__ */ new Set(), E.add(U);
								break;
							}
							if (!E.has(U)) {
								E.add(U);
								break;
							}
							B(v, function() {
								console.error("Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.", U);
							});
							break;
						case kt: k = xo(k), K(b, v, k, E);
					}
					return E;
				}
				function Fe(b, v, k, E) {
					for (var U = null, ke = null, X = null, te = v, re = v = 0, Qe = null; te !== null && re < k.length; re++) {
						te.index > re ? (Qe = te, te = null) : Qe = te.sibling;
						var kn = I(b, te, k[re], E);
						if (kn === null) {
							te === null && (te = Qe);
							break;
						}
						U = K(b, kn, k[re], U), e && te && kn.alternate === null && n(b, te), v = u(kn, v, re), X === null ? ke = kn : X.sibling = kn, X = kn, te = Qe;
					}
					if (re === k.length) return o(b, te), ge && ho(b, re), ke;
					if (te === null) {
						for (; re < k.length; re++) te = _(b, k[re], E), te !== null && (U = K(b, te, k[re], U), v = u(te, v, re), X === null ? ke = te : X.sibling = te, X = te);
						return ge && ho(b, re), ke;
					}
					for (te = i(te); re < k.length; re++) Qe = O(te, b, re, k[re], E), Qe !== null && (U = K(b, Qe, k[re], U), e && Qe.alternate !== null && te.delete(Qe.key === null ? re : Qe.key), v = u(Qe, v, re), X === null ? ke = Qe : X.sibling = Qe, X = Qe);
					return e && te.forEach(function(wi) {
						return n(b, wi);
					}), ge && ho(b, re), ke;
				}
				function Td(b, v, k, E) {
					if (k == null) throw Error("An iterable object provided no iterator.");
					for (var U = null, ke = null, X = v, te = v = 0, re = null, Qe = null, kn = k.next(); X !== null && !kn.done; te++, kn = k.next()) {
						X.index > te ? (re = X, X = null) : re = X.sibling;
						var wi = I(b, X, kn.value, E);
						if (wi === null) {
							X === null && (X = re);
							break;
						}
						Qe = K(b, wi, kn.value, Qe), e && X && wi.alternate === null && n(b, X), v = u(wi, v, te), ke === null ? U = wi : ke.sibling = wi, ke = wi, X = re;
					}
					if (kn.done) return o(b, X), ge && ho(b, te), U;
					if (X === null) {
						for (; !kn.done; te++, kn = k.next()) X = _(b, kn.value, E), X !== null && (Qe = K(b, X, kn.value, Qe), v = u(X, v, te), ke === null ? U = X : ke.sibling = X, ke = X);
						return ge && ho(b, te), U;
					}
					for (X = i(X); !kn.done; te++, kn = k.next()) re = O(X, b, te, kn.value, E), re !== null && (Qe = K(b, re, kn.value, Qe), e && re.alternate !== null && X.delete(re.key === null ? te : re.key), v = u(re, v, te), ke === null ? U = re : ke.sibling = re, ke = re);
					return e && X.forEach(function(Yb) {
						return n(b, Yb);
					}), ge && ho(b, te), U;
				}
				function Jo(b, v, k, E) {
					if (typeof k == "object" && k !== null && k.type === ol && k.key === null && (ea(k, null, b), k = k.props.children), typeof k == "object" && k !== null) {
						switch (k.$$typeof) {
							case Ho:
								var U = Nn(k._debugInfo);
								e: {
									for (var ke = k.key; v !== null;) {
										if (v.key === ke) {
											if (ke = k.type, ke === ol) {
												if (v.tag === 7) {
													o(b, v.sibling), E = s(v, k.props.children), E.return = b, E._debugOwner = k._owner, E._debugInfo = oe, ea(k, E, b), b = E;
													break e;
												}
											} else if (v.elementType === ke || Wf(v, k) || typeof ke == "object" && ke !== null && ke.$$typeof === kt && xo(ke) === v.type) {
												o(b, v.sibling), E = s(v, k.props), na(E, k), E.return = b, E._debugOwner = k._owner, E._debugInfo = oe, b = E;
												break e;
											}
											o(b, v);
											break;
										} else n(b, v);
										v = v.sibling;
									}
									k.type === ol ? (E = fa(k.props.children, b.mode, E, k.key), E.return = b, E._debugOwner = b, E._debugTask = b._debugTask, E._debugInfo = oe, ea(k, E, b), b = E) : (E = Rc(k, b.mode, E), na(E, k), E.return = b, E._debugInfo = oe, b = E);
								}
								return b = f(b), oe = U, b;
							case Ao:
								e: {
									for (U = k, k = U.key; v !== null;) {
										if (v.key === k) if (v.tag === 4 && v.stateNode.containerInfo === U.containerInfo && v.stateNode.implementation === U.implementation) {
											o(b, v.sibling), E = s(v, U.children || []), E.return = b, b = E;
											break e;
										} else {
											o(b, v);
											break;
										}
										else n(b, v);
										v = v.sibling;
									}
									E = Hs(U, b.mode, E), E.return = b, b = E;
								}
								return f(b);
							case kt: return U = Nn(k._debugInfo), k = xo(k), b = Jo(b, v, k, E), oe = U, b;
						}
						if (fn(k)) return U = Nn(k._debugInfo), b = Fe(b, v, k, E), oe = U, b;
						if (Yo(k)) {
							if (U = Nn(k._debugInfo), ke = Yo(k), typeof ke != "function") throw Error("An object is not an iterable. This error is likely caused by a bug in React. Please file an issue.");
							var X = ke.call(k);
							return X === k ? (b.tag !== 0 || Object.prototype.toString.call(b.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(X) !== "[object Generator]") && (Sy || console.error("Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."), Sy = !0) : k.entries !== ke || yg || (console.error("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), yg = !0), b = Td(b, v, X, E), oe = U, b;
						}
						if (typeof k.then == "function") return U = Nn(k._debugInfo), b = Jo(b, v, Wi(k), E), oe = U, b;
						if (k.$$typeof === on) return Jo(b, v, Hi(b, k), E);
						ns(b, k);
					}
					return typeof k == "string" && k !== "" || typeof k == "number" || typeof k == "bigint" ? (U = "" + k, v !== null && v.tag === 6 ? (o(b, v.sibling), E = s(v, U), E.return = b, b = E) : (o(b, v), E = Ec(U, b.mode, E), E.return = b, E._debugOwner = b, E._debugTask = b._debugTask, E._debugInfo = oe, b = E), f(b)) : (typeof k == "function" && ts(b, k), typeof k == "symbol" && Wr(b, k), o(b, v));
				}
				return function(b, v, k, E) {
					var U = oe;
					oe = null;
					try {
						fp = 0;
						var ke = Jo(b, v, k, E);
						return fd = null, ke;
					} catch (Qe) {
						if (Qe === dd || Qe === am) throw Qe;
						var X = lt(29, Qe, null, b.mode);
						X.lanes = E, X.return = b;
						var te = X._debugInfo = oe;
						if (X._debugOwner = b._debugOwner, X._debugTask = b._debugTask, te != null) {
							for (var re = te.length - 1; 0 <= re; re--) if (typeof te[re].stack == "string") {
								X._debugOwner = te[re], X._debugTask = te[re].debugTask;
								break;
							}
						}
						return X;
					} finally {
						oe = U;
					}
				};
			}
			function Zd(e, n) {
				var o = fn(e);
				return e = !o && typeof Yo(e) == "function", o || e ? (o = o ? "array" : "iterable", console.error("A nested %s was passed to row #%s in <SuspenseList />. Wrap it in an additional SuspenseList to configure its revealOrder: <SuspenseList revealOrder=...> ... <SuspenseList revealOrder=...>{%s}</SuspenseList> ... </SuspenseList>", o, n, o), !1) : !0;
			}
			function Ui() {
				for (var e = pd, n = bg = pd = 0; n < e;) {
					var o = io[n];
					io[n++] = null;
					var i = io[n];
					io[n++] = null;
					var s = io[n];
					io[n++] = null;
					var u = io[n];
					if (io[n++] = null, i !== null && s !== null) {
						var f = i.pending;
						f === null ? s.next = s : (s.next = f.next, f.next = s), i.pending = s;
					}
					u !== 0 && wn(o, s, u);
				}
			}
			function os(e, n, o, i) {
				io[pd++] = e, io[pd++] = n, io[pd++] = o, io[pd++] = i, bg |= i, e.lanes |= i, e = e.alternate, e !== null && (e.lanes |= i);
			}
			function Hu(e, n, o, i) {
				return os(e, n, o, i), as(e);
			}
			function On(e, n) {
				return os(e, null, null, n), as(e);
			}
			function wn(e, n, o) {
				e.lanes |= o;
				var i = e.alternate;
				i !== null && (i.lanes |= o);
				for (var s = !1, u = e.return; u !== null;) u.childLanes |= o, i = u.alternate, i !== null && (i.childLanes |= o), u.tag === 22 && (e = u.stateNode, e === null || e._visibility & pp || (s = !0)), e = u, u = u.return;
				return e.tag === 3 ? (u = e.stateNode, s && n !== null && (s = 31 - vn(o), e = u.hiddenUpdates, i = e[s], i === null ? e[s] = [n] : i.push(n), n.lane = o | 536870912), u) : null;
			}
			function as(e) {
				if (zp > Gb) throw cu = zp = 0, Cp = Ug = null, Error("Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.");
				cu > Jb && (cu = 0, Cp = null, console.error("Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.")), e.alternate === null && e.flags & 4098 && zc(e);
				for (var n = e, o = n.return; o !== null;) n.alternate === null && n.flags & 4098 && zc(e), n = o, o = n.return;
				return n.tag === 3 ? n.stateNode : null;
			}
			function Au(e) {
				e.updateQueue = {
					baseState: e.memoizedState,
					firstBaseUpdate: null,
					lastBaseUpdate: null,
					shared: {
						pending: null,
						lanes: 0,
						hiddenCallbacks: null
					},
					callbacks: null
				};
			}
			function ju(e, n) {
				e = e.updateQueue, n.updateQueue === e && (n.updateQueue = {
					baseState: e.baseState,
					firstBaseUpdate: e.firstBaseUpdate,
					lastBaseUpdate: e.lastBaseUpdate,
					shared: e.shared,
					callbacks: null
				});
			}
			function zo(e) {
				return {
					lane: e,
					tag: zy,
					payload: null,
					callback: null,
					next: null
				};
			}
			function Mt(e, n, o) {
				var i = e.updateQueue;
				if (i === null) return null;
				if (i = i.shared, Sg === i && !_y) {
					var s = G(e);
					console.error(`An update (setState, replaceState, or forceUpdate) was scheduled from inside an update function. Update functions should be pure, with zero side-effects. Consider using componentDidUpdate or a callback.

Please update the following component: %s`, s), _y = !0;
				}
				return (ye & Zn) !== Jn ? (s = i.pending, s === null ? n.next = n : (n.next = s.next, s.next = n), i.pending = n, n = as(e), wn(e, null, o), n) : (os(e, i, n, o), as(e));
			}
			function Bi(e, n, o) {
				if (n = n.updateQueue, n !== null && (n = n.shared, (o & 4194048) !== 0)) {
					var i = n.lanes;
					i &= e.pendingLanes, o |= i, n.lanes = o, Ld(e, o);
				}
			}
			function Ua(e, n) {
				var o = e.updateQueue, i = e.alternate;
				if (i !== null && (i = i.updateQueue, o === i)) {
					var s = null, u = null;
					if (o = o.firstBaseUpdate, o !== null) {
						do {
							var f = {
								lane: o.lane,
								tag: o.tag,
								payload: o.payload,
								callback: null,
								next: null
							};
							u === null ? s = u = f : u = u.next = f, o = o.next;
						} while (o !== null);
						u === null ? s = u = n : u = u.next = n;
					} else s = u = n;
					o = {
						baseState: i.baseState,
						firstBaseUpdate: s,
						lastBaseUpdate: u,
						shared: i.shared,
						callbacks: i.callbacks
					}, e.updateQueue = o;
					return;
				}
				e = o.lastBaseUpdate, e === null ? o.firstBaseUpdate = n : e.next = n, o.lastBaseUpdate = n;
			}
			function Oi() {
				if (kg) {
					var e = cd;
					if (e !== null) throw e;
				}
			}
			function is(e, n, o, i) {
				kg = !1;
				var s = e.updateQueue;
				Cl = !1, Sg = s.shared;
				var u = s.firstBaseUpdate, f = s.lastBaseUpdate, p = s.shared.pending;
				if (p !== null) {
					s.shared.pending = null;
					var g = p, S = g.next;
					g.next = null, f === null ? u = S : f.next = S, f = g;
					var T = e.alternate;
					T !== null && (T = T.updateQueue, p = T.lastBaseUpdate, p !== f && (p === null ? T.firstBaseUpdate = S : p.next = S, T.lastBaseUpdate = g));
				}
				if (u !== null) {
					var _ = s.baseState;
					f = 0, T = S = g = null, p = u;
					do {
						var I = p.lane & -536870913, O = I !== p.lane;
						if (O ? (ae & I) === I : (i & I) === I) {
							I !== 0 && I === eu && (kg = !0), T !== null && (T = T.next = {
								lane: 0,
								tag: p.tag,
								payload: p.payload,
								callback: null,
								next: null
							});
							e: {
								I = e;
								var K = p, Fe = n, Td = o;
								switch (K.tag) {
									case Cy:
										if (K = K.payload, typeof K == "function") {
											id = !0;
											var Jo = K.call(Td, _, Fe);
											if (I.mode & 8) {
												De(!0);
												try {
													K.call(Td, _, Fe);
												} finally {
													De(!1);
												}
											}
											id = !1, _ = Jo;
											break e;
										}
										_ = K;
										break e;
									case vg: I.flags = I.flags & -65537 | 128;
									case zy:
										if (Jo = K.payload, typeof Jo == "function") {
											if (id = !0, K = Jo.call(Td, _, Fe), I.mode & 8) {
												De(!0);
												try {
													Jo.call(Td, _, Fe);
												} finally {
													De(!1);
												}
											}
											id = !1;
										} else K = Jo;
										if (K == null) break e;
										_ = ze({}, _, K);
										break e;
									case Ty: Cl = !0;
								}
							}
							I = p.callback, I !== null && (e.flags |= 64, O && (e.flags |= 8192), O = s.callbacks, O === null ? s.callbacks = [I] : O.push(I));
						} else O = {
							lane: I,
							tag: p.tag,
							payload: p.payload,
							callback: p.callback,
							next: null
						}, T === null ? (S = T = O, g = _) : T = T.next = O, f |= I;
						if (p = p.next, p === null) {
							if (p = s.shared.pending, p === null) break;
							O = p, p = O.next, O.next = null, s.lastBaseUpdate = O, s.shared.pending = null;
						}
					} while (!0);
					T === null && (g = _), s.baseState = g, s.firstBaseUpdate = S, s.lastBaseUpdate = T, u === null && (s.shared.lanes = 0), Rl |= f, e.lanes = f, e.memoizedState = _;
				}
				Sg = null;
			}
			function ls(e, n) {
				if (typeof e != "function") throw Error("Invalid argument passed as callback. Expected a function. Instead received: " + e);
				e.call(n);
			}
			function Yd(e, n) {
				var o = e.shared.hiddenCallbacks;
				if (o !== null) for (e.shared.hiddenCallbacks = null, e = 0; e < o.length; e++) ls(o[e], n);
			}
			function Xd(e, n) {
				var o = e.callbacks;
				if (o !== null) for (e.callbacks = null, e = 0; e < o.length; e++) ls(o[e], n);
			}
			function Kd(e, n) {
				var o = Ta;
				pe(lm, o, e), pe(hd, n, e), Ta = o | n.baseLanes;
			}
			function Du(e) {
				pe(lm, Ta, e), pe(hd, hd.current, e);
			}
			function ss(e) {
				Ta = lm.current, Ze(hd, e), Ze(lm, e);
			}
			function Ur(e) {
				var n = e.alternate;
				pe(Sn, Sn.current & md, e), pe(_r, e, e), Qo === null && (n === null || hd.current !== null || n.memoizedState !== null) && (Qo = e);
			}
			function Wu(e) {
				pe(Sn, Sn.current, e), pe(_r, e, e), Qo === null && (Qo = e);
			}
			function Uu(e) {
				e.tag === 22 ? (pe(Sn, Sn.current, e), pe(_r, e, e), Qo === null && (Qo = e)) : mr(e);
			}
			function mr(e) {
				pe(Sn, Sn.current, e), pe(_r, _r.current, e);
			}
			function et(e) {
				Ze(_r, e), Qo === e && (Qo = null), Ze(Sn, e);
			}
			function us(e) {
				for (var n = e; n !== null;) {
					if (n.tag === 13) {
						var o = n.memoizedState;
						if (o !== null && (o = o.dehydrated, o === null || Ms(o) || $c(o))) return n;
					} else if (n.tag === 19 && (n.memoizedProps.revealOrder === "forwards" || n.memoizedProps.revealOrder === "backwards" || n.memoizedProps.revealOrder === "unstable_legacy-backwards" || n.memoizedProps.revealOrder === "together")) {
						if ((n.flags & 128) !== 0) return n;
					} else if (n.child !== null) {
						n.child.return = n, n = n.child;
						continue;
					}
					if (n === e) break;
					for (; n.sibling === null;) {
						if (n.return === null || n.return === e) return null;
						n = n.return;
					}
					n.sibling.return = n.return, n = n.sibling;
				}
				return null;
			}
			function ee() {
				var e = z;
				so === null ? so = [e] : so.push(e);
			}
			function N() {
				var e = z;
				if (so !== null && (vi++, so[vi] !== e)) {
					var n = G(Y);
					if (!Ry.has(n) && (Ry.add(n), so !== null)) {
						for (var o = "", i = 0; i <= vi; i++) {
							var s = so[i], u = i === vi ? e : s;
							for (s = i + 1 + ". " + s; 30 > s.length;) s += " ";
							s += u + `
`, o += s;
						}
						console.error(`React has detected a change in the order of Hooks called by %s. This will lead to bugs and errors if not fixed. For more information, read the Rules of Hooks: https://react.dev/link/rules-of-hooks

   Previous render            Next render
   ------------------------------------------------------
%s   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
`, n, o);
					}
				}
			}
			function gt(e) {
				e == null || fn(e) || console.error("%s received a final argument that is not an array (instead, received `%s`). When specified, the final argument must be an array.", z, typeof e);
			}
			function Mi() {
				var e = G(Y);
				Iy.has(e) || (Iy.add(e), console.error("ReactDOM.useFormState has been renamed to React.useActionState. Please update %s to use React.useActionState.", e));
			}
			function Ye() {
				throw Error(`Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`);
			}
			function Bu(e, n) {
				if (gp) return !1;
				if (n === null) return console.error("%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.", z), !1;
				e.length !== n.length && console.error(`The final argument passed to %s changed size between renders. The order and size of this array must remain constant.

Previous: %s
Incoming: %s`, z, "[" + n.join(", ") + "]", "[" + e.join(", ") + "]");
				for (var o = 0; o < n.length && o < e.length; o++) if (!jt(e[o], n[o])) return !1;
				return !0;
			}
			function It(e, n, o, i, s, u) {
				yi = u, Y = n, so = e !== null ? e._debugHookTypes : null, vi = -1, gp = e !== null && e.type !== n.type, (Object.prototype.toString.call(o) === "[object AsyncFunction]" || Object.prototype.toString.call(o) === "[object AsyncGeneratorFunction]") && (u = G(Y), wg.has(u) || (wg.add(u), console.error("%s is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.", u === null ? "An unknown Component" : "<" + u + ">"))), n.memoizedState = null, n.updateQueue = null, n.lanes = 0, x.H = e !== null && e.memoizedState !== null ? xg : so !== null ? Ly : Pg, au = u = (n.mode & 8) !== Z;
				var f = hg(o, i, s);
				if (au = !1, yd && (f = Ou(n, o, i, s)), u) {
					De(!0);
					try {
						f = Ou(n, o, i, s);
					} finally {
						De(!1);
					}
				}
				return cs(e, n), f;
			}
			function cs(e, n) {
				n._debugHookTypes = so, n.dependencies === null ? bi !== null && (n.dependencies = {
					lanes: 0,
					firstContext: null,
					_debugThenableState: bi
				}) : n.dependencies._debugThenableState = bi, x.H = yp;
				var o = Ae !== null && Ae.next !== null;
				if (yi = 0, so = z = zn = Ae = Y = null, vi = -1, e !== null && (e.flags & 65011712) !== (n.flags & 65011712) && console.error("Internal React error: Expected static flag was missing. Please notify the React team."), um = !1, mp = 0, bi = null, o) throw Error("Rendered fewer hooks than expected. This may be caused by an accidental early return statement.");
				e === null || Cn || (e = e.dependencies, e !== null && ja(e) && (Cn = !0)), dp ? (dp = !1, e = !0) : e = !1, e && (n = G(n) || "Unknown", Ey.has(n) || wg.has(n) || (Ey.add(n), console.error("`use` was called from inside a try/catch block. This is not allowed and can lead to unexpected behavior. To handle errors triggered by `use`, wrap your component in a error boundary.")));
			}
			function Ou(e, n, o, i) {
				Y = e;
				var s = 0;
				do {
					if (yd && (bi = null), mp = 0, yd = !1, s >= $b) throw Error("Too many re-renders. React limits the number of renders to prevent an infinite loop.");
					if (s += 1, gp = !1, zn = Ae = null, e.updateQueue != null) {
						var u = e.updateQueue;
						u.lastEffect = null, u.events = null, u.stores = null, u.memoCache != null && (u.memoCache.index = 0);
					}
					vi = -1, x.H = Ny, u = hg(n, o, i);
				} while (yd);
				return u;
			}
			function ef() {
				var e = x.H, n = e.useState()[0];
				return n = typeof n.then == "function" ? Co(n) : n, e = e.useState()[0], (Ae !== null ? Ae.memoizedState : null) !== e && (Y.flags |= 1024), n;
			}
			function Mu() {
				var e = cm !== 0;
				return cm = 0, e;
			}
			function Qu(e, n, o) {
				n.updateQueue = e.updateQueue, n.flags = (n.mode & 16) !== Z ? n.flags & -402655237 : n.flags & -2053, e.lanes &= ~o;
			}
			function ds(e) {
				if (um) {
					for (e = e.memoizedState; e !== null;) {
						var n = e.queue;
						n !== null && (n.pending = null), e = e.next;
					}
					um = !1;
				}
				yi = 0, so = zn = Ae = Y = null, vi = -1, z = null, yd = !1, mp = cm = 0, bi = null;
			}
			function Fn() {
				var e = {
					memoizedState: null,
					baseState: null,
					baseQueue: null,
					queue: null,
					next: null
				};
				return zn === null ? Y.memoizedState = zn = e : zn = zn.next = e, zn;
			}
			function xe() {
				if (Ae === null) {
					var e = Y.alternate;
					e = e !== null ? e.memoizedState : null;
				} else e = Ae.next;
				var n = zn === null ? Y.memoizedState : zn.next;
				if (n !== null) zn = n, Ae = e;
				else {
					if (e === null) throw Y.alternate === null ? Error("Update hook called on initial render. This is likely a bug in React. Please file an issue.") : Error("Rendered more hooks than during the previous render.");
					Ae = e, e = {
						memoizedState: Ae.memoizedState,
						baseState: Ae.baseState,
						baseQueue: Ae.baseQueue,
						queue: Ae.queue,
						next: null
					}, zn === null ? Y.memoizedState = zn = e : zn = zn.next = e;
				}
				return zn;
			}
			function Ba() {
				return {
					lastEffect: null,
					events: null,
					stores: null,
					memoCache: null
				};
			}
			function Co(e) {
				var n = mp;
				return mp += 1, bi === null && (bi = $d()), e = Lu(bi, e, n), n = Y, (zn === null ? n.memoizedState : zn.next) === null && (n = n.alternate, x.H = n !== null && n.memoizedState !== null ? xg : Pg), e;
			}
			function we(e) {
				if (e !== null && typeof e == "object") {
					if (typeof e.then == "function") return Co(e);
					if (e.$$typeof === on) return Ee(e);
				}
				throw Error("An unsupported type was passed to use(): " + String(e));
			}
			function Oa(e) {
				var n = null, o = Y.updateQueue;
				if (o !== null && (n = o.memoCache), n == null) {
					var i = Y.alternate;
					i !== null && (i = i.updateQueue, i !== null && (i = i.memoCache, i != null && (n = {
						data: i.data.map(function(s) {
							return s.slice();
						}),
						index: 0
					})));
				}
				if (n ??= {
					data: [],
					index: 0
				}, o === null && (o = Ba(), Y.updateQueue = o), o.memoCache = n, o = n.data[n.index], o === void 0 || gp) for (o = n.data[n.index] = Array(e), i = 0; i < e; i++) o[i] = Bh;
				else o.length !== e && console.error("Expected a constant size argument for each invocation of useMemoCache. The previous cache was allocated with size %s but size %s was requested.", o.length, e);
				return n.index++, o;
			}
			function gr(e, n) {
				return typeof n == "function" ? n(e) : n;
			}
			function $u(e, n, o) {
				var i = Fn();
				if (o !== void 0) {
					var s = o(n);
					if (au) {
						De(!0);
						try {
							o(n);
						} finally {
							De(!1);
						}
					}
				} else s = n;
				return i.memoizedState = i.baseState = s, e = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: e,
					lastRenderedState: s
				}, i.queue = e, e = e.dispatch = Vp.bind(null, Y, e), [i.memoizedState, e];
			}
			function Br(e) {
				return Or(xe(), Ae, e);
			}
			function Or(e, n, o) {
				var i = e.queue;
				if (i === null) throw Error("Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)");
				i.lastRenderedReducer = o;
				var s = e.baseQueue, u = i.pending;
				if (u !== null) {
					if (s !== null) {
						var f = s.next;
						s.next = u.next, u.next = f;
					}
					n.baseQueue !== s && console.error("Internal error: Expected work-in-progress queue to be a clone. This is a bug in React."), n.baseQueue = s = u, i.pending = null;
				}
				if (u = e.baseState, s === null) e.memoizedState = u;
				else {
					n = s.next;
					var p = f = null, g = null, S = n, T = !1;
					do {
						var _ = S.lane & -536870913;
						if (_ !== S.lane ? (ae & _) === _ : (yi & _) === _) {
							var I = S.revertLane;
							if (I === 0) g !== null && (g = g.next = {
								lane: 0,
								revertLane: 0,
								gesture: null,
								action: S.action,
								hasEagerState: S.hasEagerState,
								eagerState: S.eagerState,
								next: null
							}), _ === eu && (T = !0);
							else if ((yi & I) === I) {
								S = S.next, I === eu && (T = !0);
								continue;
							} else _ = {
								lane: 0,
								revertLane: S.revertLane,
								gesture: null,
								action: S.action,
								hasEagerState: S.hasEagerState,
								eagerState: S.eagerState,
								next: null
							}, g === null ? (p = g = _, f = u) : g = g.next = _, Y.lanes |= I, Rl |= I;
							_ = S.action, au && o(u, _), u = S.hasEagerState ? S.eagerState : o(u, _);
						} else I = {
							lane: _,
							revertLane: S.revertLane,
							gesture: S.gesture,
							action: S.action,
							hasEagerState: S.hasEagerState,
							eagerState: S.eagerState,
							next: null
						}, g === null ? (p = g = I, f = u) : g = g.next = I, Y.lanes |= _, Rl |= _;
						S = S.next;
					} while (S !== null && S !== n);
					if (g === null ? f = u : g.next = p, !jt(u, e.memoizedState) && (Cn = !0, T && (o = cd, o !== null))) throw o;
					e.memoizedState = u, e.baseState = f, e.baseQueue = g, i.lastRenderedState = u;
				}
				return s === null && (i.lanes = 0), [e.memoizedState, i.dispatch];
			}
			function Qi(e) {
				var n = xe(), o = n.queue;
				if (o === null) throw Error("Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)");
				o.lastRenderedReducer = e;
				var i = o.dispatch, s = o.pending, u = n.memoizedState;
				if (s !== null) {
					o.pending = null;
					var f = s = s.next;
					do
						u = e(u, f.action), f = f.next;
					while (f !== s);
					jt(u, n.memoizedState) || (Cn = !0), n.memoizedState = u, n.baseQueue === null && (n.baseState = u), o.lastRenderedState = u;
				}
				return [u, i];
			}
			function Vu(e, n, o) {
				var i = Y, s = Fn();
				if (ge) {
					if (o === void 0) throw Error("Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.");
					var u = o();
					gd || u === o() || (console.error("The result of getServerSnapshot should be cached to avoid an infinite loop"), gd = !0);
				} else {
					if (u = n(), gd || (o = n(), jt(u, o) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), gd = !0)), je === null) throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
					ae & 127 || yr(i, n, u);
				}
				return s.memoizedState = u, o = {
					value: u,
					getSnapshot: n
				}, s.queue = o, yt(qu.bind(null, i, o, e), [e]), i.flags |= 2048, Vt(lo | Ut, { destroy: void 0 }, nf.bind(null, i, o, u, n), null), u;
			}
			function ta(e, n, o) {
				var i = Y, s = xe(), u = ge;
				if (u) {
					if (o === void 0) throw Error("Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.");
					o = o();
				} else if (o = n(), !gd) {
					var f = n();
					jt(o, f) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), gd = !0);
				}
				(f = !jt((Ae || s).memoizedState, o)) && (s.memoizedState = o, Cn = !0), s = s.queue;
				if (Qn(2048, Ut, qu.bind(null, i, s, e), [e]), s.getSnapshot !== n || f || zn !== null && zn.memoizedState.tag & lo) {
					if (i.flags |= 2048, Vt(lo | Ut, { destroy: void 0 }, nf.bind(null, i, s, o, n), null), je === null) throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
					u || yi & 127 || yr(i, n, o);
				}
				return o;
			}
			function yr(e, n, o) {
				e.flags |= 16384, e = {
					getSnapshot: n,
					value: o
				}, n = Y.updateQueue, n === null ? (n = Ba(), Y.updateQueue = n, n.stores = [e]) : (o = n.stores, o === null ? n.stores = [e] : o.push(e));
			}
			function nf(e, n, o, i) {
				n.value = o, n.getSnapshot = i, tf(n) && Gu(e);
			}
			function qu(e, n, o) {
				return o(function() {
					tf(n) && (ur(2, "updateSyncExternalStore()", e), Gu(e));
				});
			}
			function tf(e) {
				var n = e.getSnapshot;
				e = e.value;
				try {
					var o = n();
					return !jt(e, o);
				} catch {
					return !0;
				}
			}
			function Gu(e) {
				var n = On(e, 2);
				n !== null && We(n, e, 2);
			}
			function fs(e) {
				var n = Fn();
				if (typeof e == "function") {
					var o = e;
					if (e = o(), au) {
						De(!0);
						try {
							o();
						} finally {
							De(!1);
						}
					}
				}
				return n.memoizedState = n.baseState = e, n.queue = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: gr,
					lastRenderedState: e
				}, n;
			}
			function $i(e) {
				e = fs(e);
				var n = e.queue, o = cf.bind(null, Y, n);
				return n.dispatch = o, [e.memoizedState, o];
			}
			function Ju(e) {
				var n = Fn();
				n.memoizedState = n.baseState = e;
				var o = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: null,
					lastRenderedState: null
				};
				return n.queue = o, n = Gi.bind(null, Y, !0, o), o.dispatch = n, [e, n];
			}
			function rf(e, n) {
				return Wp(xe(), Ae, e, n);
			}
			function Wp(e, n, o, i) {
				return e.baseState = o, Or(e, Ae, typeof i == "function" ? i : gr);
			}
			function of(e, n) {
				var o = xe();
				return Ae !== null ? Wp(o, Ae, e, n) : (o.baseState = e, [e, o.queue.dispatch]);
			}
			function Up(e, n, o, i, s) {
				if (Ji(e)) throw Error("Cannot update form state while rendering.");
				if (e = n.action, e !== null) {
					var u = {
						payload: s,
						action: e,
						next: null,
						isTransition: !0,
						status: "pending",
						value: null,
						reason: null,
						listeners: [],
						then: function(f) {
							u.listeners.push(f);
						}
					};
					x.T !== null ? o(!0) : u.isTransition = !1, i(u), o = n.pending, o === null ? (u.next = n.pending = u, Qt(n, u)) : (u.next = o.next, n.pending = o.next = u);
				}
			}
			function Qt(e, n) {
				var o = n.action, i = n.payload, s = e.state;
				if (n.isTransition) {
					var u = x.T, f = {};
					f._updatedFibers = /* @__PURE__ */ new Set(), x.T = f;
					try {
						var p = o(s, i), g = x.S;
						g !== null && g(f, p), Zu(e, n, p);
					} catch (S) {
						Yu(e, n, S);
					} finally {
						u !== null && f.types !== null && (u.types !== null && u.types !== f.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), u.types = f.types), x.T = u, u === null && f._updatedFibers && (e = f._updatedFibers.size, f._updatedFibers.clear(), 10 < e && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."));
					}
				} else try {
					f = o(s, i), Zu(e, n, f);
				} catch (S) {
					Yu(e, n, S);
				}
			}
			function Zu(e, n, o) {
				o !== null && typeof o == "object" && typeof o.then == "function" ? (x.asyncTransitions++, o.then(ys, ys), o.then(function(i) {
					af(e, n, i);
				}, function(i) {
					return Yu(e, n, i);
				}), n.isTransition || console.error("An async function with useActionState was called outside of a transition. This is likely not what you intended (for example, isPending will not update correctly). Either call the returned function inside startTransition, or pass it to an `action` or `formAction` prop.")) : af(e, n, o);
			}
			function af(e, n, o) {
				n.status = "fulfilled", n.value = o, Bp(n), e.state = o, n = e.pending, n !== null && (o = n.next, o === n ? e.pending = null : (o = o.next, n.next = o, Qt(e, o)));
			}
			function Yu(e, n, o) {
				var i = e.pending;
				if (e.pending = null, i !== null) {
					i = i.next;
					do
						n.status = "rejected", n.reason = o, Bp(n), n = n.next;
					while (n !== i);
				}
				e.action = null;
			}
			function Bp(e) {
				e = e.listeners;
				for (var n = 0; n < e.length; n++) (0, e[n])();
			}
			function ps(e, n) {
				return n;
			}
			function tn(e, n) {
				if (ge) {
					var o = je.formState;
					if (o !== null) {
						e: {
							var i = Y;
							if (ge) {
								if (Ke) {
									var s = Pt(Ke, oo);
									if (s) {
										Ke = ga(s), i = Cr(s);
										break e;
									}
								}
								Fr(i);
							}
							i = !1;
						}
						i && (n = o[0]);
					}
				}
				o = Fn(), o.memoizedState = o.baseState = n, i = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: ps,
					lastRenderedState: n
				}, o.queue = i, o = cf.bind(null, Y, i), i.dispatch = o, i = fs(!1);
				var u = Gi.bind(null, Y, !1, i.queue);
				return i = Fn(), s = {
					state: n,
					dispatch: null,
					action: e,
					pending: null
				}, i.queue = s, o = Up.bind(null, Y, s, u, o), s.dispatch = o, i.memoizedState = e, [
					n,
					o,
					!1
				];
			}
			function hs(e) {
				return Mn(xe(), Ae, e);
			}
			function Mn(e, n, o) {
				if (n = Or(e, n, ps)[0], e = Br(gr)[0], typeof n == "object" && n !== null && typeof n.then == "function") try {
					var i = Co(n);
				} catch (f) {
					throw f === dd ? am : f;
				}
				else i = n;
				n = xe();
				var s = n.queue, u = s.dispatch;
				return o !== n.memoizedState && (Y.flags |= 2048, Vt(lo | Ut, { destroy: void 0 }, Op.bind(null, s, o), null)), [
					i,
					u,
					e
				];
			}
			function Op(e, n) {
				e.action = n;
			}
			function $t(e) {
				var n = xe(), o = Ae;
				if (o !== null) return Mn(n, o, e);
				xe(), n = n.memoizedState, o = xe();
				var i = o.queue.dispatch;
				return o.memoizedState = e, [
					n,
					i,
					!1
				];
			}
			function Vt(e, n, o, i) {
				return e = {
					tag: e,
					create: o,
					deps: i,
					inst: n,
					next: null
				}, n = Y.updateQueue, n === null && (n = Ba(), Y.updateQueue = n), o = n.lastEffect, o === null ? n.lastEffect = e.next = e : (i = o.next, o.next = e, e.next = i, n.lastEffect = e), e;
			}
			function br(e) {
				var n = Fn();
				return e = { current: e }, n.memoizedState = e;
			}
			function To(e, n, o, i) {
				var s = Fn();
				Y.flags |= e, s.memoizedState = Vt(lo | n, { destroy: void 0 }, o, i === void 0 ? null : i);
			}
			function Qn(e, n, o, i) {
				var s = xe();
				i = i === void 0 ? null : i;
				var u = s.memoizedState.inst;
				Ae !== null && i !== null && Bu(i, Ae.memoizedState.deps) ? s.memoizedState = Vt(n, u, o, i) : (Y.flags |= e, s.memoizedState = Vt(lo | n, u, o, i));
			}
			function yt(e, n) {
				(Y.mode & 16) !== Z ? To(276826112, Ut, e, n) : To(8390656, Ut, e, n);
			}
			function Mp(e) {
				Y.flags |= 4;
				var n = Y.updateQueue;
				if (n === null) n = Ba(), Y.updateQueue = n, n.events = [e];
				else {
					var o = n.events;
					o === null ? n.events = [e] : o.push(e);
				}
			}
			function ra(e) {
				var n = Fn(), o = { impl: e };
				return n.memoizedState = o, function() {
					if ((ye & Zn) !== Jn) throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
					return o.impl.apply(void 0, arguments);
				};
			}
			function oa(e) {
				var n = xe().memoizedState;
				return Mp({
					ref: n,
					nextImpl: e
				}), function() {
					if ((ye & Zn) !== Jn) throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
					return n.impl.apply(void 0, arguments);
				};
			}
			function _o(e, n) {
				var o = 4194308;
				return (Y.mode & 16) !== Z && (o |= 134217728), To(o, Rr, e, n);
			}
			function lf(e, n) {
				if (typeof n == "function") {
					e = e();
					var o = n(e);
					return function() {
						typeof o == "function" ? o() : n(null);
					};
				}
				if (n != null) return n.hasOwnProperty("current") || console.error("Expected useImperativeHandle() first argument to either be a ref callback or React.createRef() object. Instead received: %s.", "an object with keys {" + Object.keys(n).join(", ") + "}"), e = e(), n.current = e, function() {
					n.current = null;
				};
			}
			function Xu(e, n, o) {
				typeof n != "function" && console.error("Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.", n !== null ? typeof n : "null"), o = o != null ? o.concat([e]) : null;
				var i = 4194308;
				(Y.mode & 16) !== Z && (i |= 134217728), To(i, Rr, lf.bind(null, n, e), o);
			}
			function aa(e, n, o) {
				typeof n != "function" && console.error("Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.", n !== null ? typeof n : "null"), o = o != null ? o.concat([e]) : null, Qn(4, Rr, lf.bind(null, n, e), o);
			}
			function Ku(e, n) {
				return Fn().memoizedState = [e, n === void 0 ? null : n], e;
			}
			function Ma(e, n) {
				var o = xe();
				n = n === void 0 ? null : n;
				var i = o.memoizedState;
				return n !== null && Bu(n, i[1]) ? i[0] : (o.memoizedState = [e, n], e);
			}
			function ec(e, n) {
				var o = Fn();
				n = n === void 0 ? null : n;
				var i = e();
				if (au) {
					De(!0);
					try {
						e();
					} finally {
						De(!1);
					}
				}
				return o.memoizedState = [i, n], i;
			}
			function Vi(e, n) {
				var o = xe();
				n = n === void 0 ? null : n;
				var i = o.memoizedState;
				if (n !== null && Bu(n, i[1])) return i[0];
				if (i = e(), au) {
					De(!0);
					try {
						e();
					} finally {
						De(!1);
					}
				}
				return o.memoizedState = [i, n], i;
			}
			function ms(e, n) {
				return gs(Fn(), e, n);
			}
			function nc(e, n) {
				return bt(xe(), Ae.memoizedState, e, n);
			}
			function sf(e, n) {
				var o = xe();
				return Ae === null ? gs(o, e, n) : bt(o, Ae.memoizedState, e, n);
			}
			function gs(e, n, o) {
				return o === void 0 || (yi & 1073741824) !== 0 && (ae & 261930) === 0 ? e.memoizedState = n : (e.memoizedState = o, e = gh(), Y.lanes |= e, Rl |= e, o);
			}
			function bt(e, n, o, i) {
				return jt(o, n) ? o : hd.current !== null ? (e = gs(e, o, i), jt(e, n) || (Cn = !0), e) : (yi & 42) === 0 || (yi & 1073741824) !== 0 && (ae & 261930) === 0 ? (Cn = !0, e.memoizedState = o) : (e = gh(), Y.lanes |= e, Rl |= e, n);
			}
			function ys() {
				x.asyncTransitions--;
			}
			function nt(e, n, o, i, s) {
				var u = wt();
				an(u !== 0 && 8 > u ? u : 8);
				var f = x.T, p = {};
				p._updatedFibers = /* @__PURE__ */ new Set(), x.T = p, Gi(e, !1, n, o);
				try {
					var g = s(), S = x.S;
					if (S !== null && S(p, g), g !== null && typeof g == "object" && typeof g.then == "function") {
						x.asyncTransitions++, g.then(ys, ys);
						var T = Qd(g, i);
						qi(e, n, T, Nt(e));
					} else qi(e, n, i, Nt(e));
				} catch (_) {
					qi(e, n, {
						then: function() {},
						status: "rejected",
						reason: _
					}, Nt(e));
				} finally {
					an(u), f !== null && p.types !== null && (f.types !== null && f.types !== p.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), f.types = p.types), x.T = f, f === null && p._updatedFibers && (e = p._updatedFibers.size, p._updatedFibers.clear(), 10 < e && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."));
				}
			}
			function uf(e) {
				var n = e.memoizedState;
				if (n !== null) return n;
				n = {
					memoizedState: Xt,
					baseState: Xt,
					baseQueue: null,
					queue: {
						pending: null,
						lanes: 0,
						dispatch: null,
						lastRenderedReducer: gr,
						lastRenderedState: Xt
					},
					next: null
				};
				var o = {};
				return n.next = {
					memoizedState: o,
					baseState: o,
					baseQueue: null,
					queue: {
						pending: null,
						lanes: 0,
						dispatch: null,
						lastRenderedReducer: gr,
						lastRenderedState: o
					},
					next: null
				}, e.memoizedState = n, e = e.alternate, e !== null && (e.memoizedState = n), n;
			}
			function tc() {
				var e = fs(!1);
				return e = nt.bind(null, Y, e.queue, !0, !1), Fn().memoizedState = e, [!1, e];
			}
			function Qp() {
				var e = Br(gr)[0], n = xe().memoizedState;
				return [typeof e == "boolean" ? e : Co(e), n];
			}
			function Ro() {
				var e = Qi(gr)[0], n = xe().memoizedState;
				return [typeof e == "boolean" ? e : Co(e), n];
			}
			function ia() {
				return Ee(Kt);
			}
			function bs() {
				var e = Fn(), n = je.identifierPrefix;
				if (ge) {
					var o = ci, i = ui;
					o = (i & ~(1 << 32 - vn(i) - 1)).toString(32) + o, n = "_" + n + "R_" + o, o = cm++, 0 < o && (n += "H" + o.toString(32)), n += "_";
				} else o = Qb++, n = "_" + n + "r_" + o.toString(32) + "_";
				return e.memoizedState = n;
			}
			function la() {
				return Fn().memoizedState = $p.bind(null, Y);
			}
			function $p(e, n) {
				for (var o = e.return; o !== null;) {
					switch (o.tag) {
						case 24:
						case 3:
							var i = Nt(o), s = zo(i), u = Mt(o, s, i);
							u !== null && (ur(i, "refresh()", e), We(u, o, i), Bi(u, o, i)), e = Ai(), n != null && u !== null && console.error("The seed argument is not enabled outside experimental channels."), s.payload = { cache: e };
							return;
					}
					o = o.return;
				}
			}
			function Vp(e, n, o) {
				var i = arguments;
				typeof i[3] == "function" && console.error("State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect()."), i = Nt(e);
				var s = {
					lane: i,
					revertLane: 0,
					gesture: null,
					action: o,
					hasEagerState: !1,
					eagerState: null,
					next: null
				};
				Ji(e) ? qp(n, s) : (s = Hu(e, n, s, i), s !== null && (ur(i, "dispatch()", e), We(s, e, i), Gp(s, n, i)));
			}
			function cf(e, n, o) {
				var i = arguments;
				typeof i[3] == "function" && console.error("State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect()."), i = Nt(e), qi(e, n, o, i) && ur(i, "setState()", e);
			}
			function qi(e, n, o, i) {
				var s = {
					lane: i,
					revertLane: 0,
					gesture: null,
					action: o,
					hasEagerState: !1,
					eagerState: null,
					next: null
				};
				if (Ji(e)) qp(n, s);
				else {
					var u = e.alternate;
					if (e.lanes === 0 && (u === null || u.lanes === 0) && (u = n.lastRenderedReducer, u !== null)) {
						var f = x.H;
						x.H = $o;
						try {
							var p = n.lastRenderedState, g = u(p, o);
							if (s.hasEagerState = !0, s.eagerState = g, jt(g, p)) return os(e, n, s, 0), je === null && Ui(), !1;
						} catch {} finally {
							x.H = f;
						}
					}
					if (o = Hu(e, n, s, i), o !== null) return We(o, e, i), Gp(o, n, i), !0;
				}
				return !1;
			}
			function Gi(e, n, o, i) {
				if (x.T === null && eu === 0 && console.error("An optimistic state update occurred outside a transition or action. To fix, move the update to an action, or wrap with startTransition."), i = {
					lane: 2,
					revertLane: Ru(),
					gesture: null,
					action: i,
					hasEagerState: !1,
					eagerState: null,
					next: null
				}, Ji(e)) {
					if (n) throw Error("Cannot update optimistic state while rendering.");
					console.error("Cannot call startTransition while rendering.");
				} else n = Hu(e, o, i, 2), n !== null && (ur(2, "setOptimistic()", e), We(n, e, 2));
			}
			function Ji(e) {
				var n = e.alternate;
				return e === Y || n !== null && n === Y;
			}
			function qp(e, n) {
				yd = um = !0;
				var o = e.pending;
				o === null ? n.next = n : (n.next = o.next, o.next = n), e.pending = n;
			}
			function Gp(e, n, o) {
				if ((o & 4194048) !== 0) {
					var i = n.lanes;
					i &= e.pendingLanes, o |= i, n.lanes = o, Ld(e, o);
				}
			}
			function df(e) {
				if (e !== null && typeof e != "function") {
					var n = String(e);
					Qy.has(n) || (Qy.add(n), console.error("Expected the last optional `callback` argument to be a function. Instead received: %s.", e));
				}
			}
			function rc(e, n, o, i) {
				var s = e.memoizedState, u = o(i, s);
				if (e.mode & 8) {
					De(!0);
					try {
						u = o(i, s);
					} finally {
						De(!1);
					}
				}
				u === void 0 && (n = $e(n) || "Component", Uy.has(n) || (Uy.add(n), console.error("%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.", n))), s = u == null ? s : ze({}, s, u), e.memoizedState = s, e.lanes === 0 && (e.updateQueue.baseState = s);
			}
			function ff(e, n, o, i, s, u, f) {
				var p = e.stateNode;
				if (typeof p.shouldComponentUpdate == "function") {
					if (o = p.shouldComponentUpdate(i, u, f), e.mode & 8) {
						De(!0);
						try {
							o = p.shouldComponentUpdate(i, u, f);
						} finally {
							De(!1);
						}
					}
					return o === void 0 && console.error("%s.shouldComponentUpdate(): Returned undefined instead of a boolean value. Make sure to return true or false.", $e(n) || "Component"), o;
				}
				return n.prototype && n.prototype.isPureReactComponent ? !es(o, i) || !es(s, u) : !0;
			}
			function Qa(e, n, o, i) {
				var s = n.state;
				typeof n.componentWillReceiveProps == "function" && n.componentWillReceiveProps(o, i), typeof n.UNSAFE_componentWillReceiveProps == "function" && n.UNSAFE_componentWillReceiveProps(o, i), n.state !== s && (e = G(e) || "Component", Hy.has(e) || (Hy.add(e), console.error("%s.componentWillReceiveProps(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.", e)), zg.enqueueReplaceState(n, n.state, null));
			}
			function Mr(e, n) {
				var o = n;
				if ("ref" in n) {
					o = {};
					for (var i in n) i !== "ref" && (o[i] = n[i]);
				}
				if (e = e.defaultProps) {
					o === n && (o = ze({}, o));
					for (var s in e) o[s] === void 0 && (o[s] = e[s]);
				}
				return o;
			}
			function vs(e, n) {
				try {
					bd = n.source ? G(n.source) : null, Cg = null;
					var o = n.value;
					if (x.actQueue !== null) x.thrownErrors.push(o);
					else {
						var i = e.onUncaughtError;
						i(o, { componentStack: n.stack });
					}
				} catch (s) {
					setTimeout(function() {
						throw s;
					});
				}
			}
			function pf(e, n, o) {
				try {
					bd = o.source ? G(o.source) : null, Cg = G(n);
					var i = e.onCaughtError;
					i(o.value, {
						componentStack: o.stack,
						errorBoundary: n.tag === 1 ? n.stateNode : null
					});
				} catch (s) {
					setTimeout(function() {
						throw s;
					});
				}
			}
			function oc(e, n, o) {
				return o = zo(o), o.tag = vg, o.payload = { element: null }, o.callback = function() {
					B(n.source, vs, e, n);
				}, o;
			}
			function ac(e) {
				return e = zo(e), e.tag = vg, e;
			}
			function ic(e, n, o, i) {
				var s = o.type.getDerivedStateFromError;
				if (typeof s == "function") {
					var u = i.value;
					e.payload = function() {
						return s(u);
					}, e.callback = function() {
						Ah(o), B(i.source, pf, n, o, i);
					};
				}
				var f = o.stateNode;
				f !== null && typeof f.componentDidCatch == "function" && (e.callback = function() {
					Ah(o), B(i.source, pf, n, o, i), typeof s != "function" && (Il === null ? Il = new Set([this]) : Il.add(this)), Ub(this, i), typeof s == "function" || !(o.lanes & 2) && console.error("%s: Error boundaries should implement getDerivedStateFromError(). In that method, return a state update to display an error message or fallback UI.", G(o) || "Unknown");
				});
			}
			function Jp(e, n, o, i, s) {
				if (o.flags |= 32768, wa && nl(e, s), i !== null && typeof i == "object" && typeof i.then == "function") {
					if (n = o.alternate, n !== null && He(n, o, s, !0), ge && (xa = !0), o = _r.current, o !== null) {
						switch (o.tag) {
							case 31:
							case 13: return Qo === null ? Pc() : o.alternate === null && nn === ki && (nn = vm), o.flags &= -257, o.flags |= 65536, o.lanes = s, i === im ? o.flags |= 16384 : (n = o.updateQueue, n === null ? o.updateQueue = new Set([i]) : n.add(i), Af(e, i, s)), !1;
							case 22: return o.flags |= 65536, i === im ? o.flags |= 16384 : (n = o.updateQueue, n === null ? (n = {
								transitions: null,
								markerInstances: null,
								retryQueue: new Set([i])
							}, o.updateQueue = n) : (o = n.retryQueue, o === null ? n.retryQueue = new Set([i]) : o.add(i)), Af(e, i, s)), !1;
						}
						throw Error("Unexpected Suspense handler tag (" + o.tag + "). This is a bug in React.");
					}
					return Af(e, i, s), Pc(), !1;
				}
				if (ge) return xa = !0, n = _r.current, n !== null ? (!(n.flags & 65536) && (n.flags |= 256), n.flags |= 65536, n.lanes = s, i !== rg && Fi(ft(Error("There was an error while hydrating but React was able to recover by instead client rendering from the nearest Suspense boundary.", { cause: i }), o))) : (i !== rg && Fi(ft(Error("There was an error while hydrating but React was able to recover by instead client rendering the entire root.", { cause: i }), o)), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, i = ft(i, o), s = oc(e.stateNode, i, s), Ua(e, s), nn !== Tl && (nn = iu)), !1;
				var u = ft(Error("There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root.", { cause: i }), o);
				if (wp === null ? wp = [u] : wp.push(u), nn !== Tl && (nn = iu), n === null) return !0;
				i = ft(i, o), o = n;
				do {
					switch (o.tag) {
						case 3: return o.flags |= 65536, e = s & -s, o.lanes |= e, e = oc(o.stateNode, i, e), Ua(o, e), !1;
						case 1: if (n = o.type, u = o.stateNode, (o.flags & 128) === 0 && (typeof n.getDerivedStateFromError == "function" || u !== null && typeof u.componentDidCatch == "function" && (Il === null || !Il.has(u)))) return o.flags |= 65536, s &= -s, o.lanes |= s, s = ac(s), ic(s, e, o, i), Ua(o, s), !1;
					}
					o = o.return;
				} while (o !== null);
				return !1;
			}
			function rn(e, n, o, i) {
				n.child = e === null ? xy(n, null, o, i) : ou(n, e.child, o, i);
			}
			function hf(e, n, o, i, s) {
				o = o.render;
				var u = n.ref;
				if ("ref" in i) {
					var f = {};
					for (var p in i) p !== "ref" && (f[p] = i[p]);
				} else f = i;
				return sr(n), i = It(e, n, o, f, u, s), p = Mu(), e !== null && !Cn ? (Qu(e, n, s), vr(e, n, s)) : (ge && p && Ei(n), n.flags |= 1, rn(e, n, i, s), n.child);
			}
			function mf(e, n, o, i, s) {
				if (e === null) {
					var u = o.type;
					return typeof u == "function" && !Tc(u) && u.defaultProps === void 0 && o.compare === null ? (o = Ya(u), n.tag = 15, n.type = o, Eo(n, u), ve(e, n, o, i, s)) : (e = _c(o.type, null, i, n, n.mode, s), e.ref = n.ref, e.return = n, n.child = e);
				}
				if (u = e.child, !ie(e, s)) {
					var f = u.memoizedProps;
					if (o = o.compare, o = o !== null ? o : es, o(f, i) && e.ref === n.ref) return vr(e, n, s);
				}
				return n.flags |= 1, e = Fo(u, i), e.ref = n.ref, e.return = n, n.child = e;
			}
			function ve(e, n, o, i, s) {
				if (e !== null) {
					var u = e.memoizedProps;
					if (es(u, i) && e.ref === n.ref && n.type === e.type) if (Cn = !1, n.pendingProps = i = u, ie(e, s)) e.flags & 131072 && (Cn = !0);
					else return n.lanes = e.lanes, vr(e, n, s);
				}
				return ks(e, n, o, i, s);
			}
			function lc(e, n, o, i) {
				var s = i.children, u = e !== null ? e.memoizedState : null;
				if (e === null && n.stateNode === null && (n.stateNode = {
					_visibility: pp,
					_pendingMarkers: null,
					_retryCache: null,
					_transitions: null
				}), i.mode === "hidden") {
					if ((n.flags & 128) !== 0) {
						if (u = u !== null ? u.baseLanes | o : o, e !== null) {
							for (i = n.child = e.child, s = 0; i !== null;) s = s | i.lanes | i.childLanes, i = i.sibling;
							i = s & ~u;
						} else i = 0, n.child = null;
						return gf(e, n, u, o, i);
					}
					if ((o & 536870912) !== 0) n.memoizedState = {
						baseLanes: 0,
						cachePool: null
					}, e !== null && Kl(n, u !== null ? u.cachePool : null), u !== null ? Kd(n, u) : Du(n), Uu(n);
					else return i = n.lanes = 536870912, gf(e, n, u !== null ? u.baseLanes | o : o, o, i);
				} else u !== null ? (Kl(n, u.cachePool), Kd(n, u), mr(n), n.memoizedState = null) : (e !== null && Kl(n, null), Du(n), mr(n));
				return rn(e, n, s, o), n.child;
			}
			function Ss(e, n) {
				return e !== null && e.tag === 22 || n.stateNode !== null || (n.stateNode = {
					_visibility: pp,
					_pendingMarkers: null,
					_retryCache: null,
					_transitions: null
				}), n.sibling;
			}
			function gf(e, n, o, i, s) {
				var u = Eu();
				return u = u === null ? null : {
					parent: at ? un._currentValue : un._currentValue2,
					pool: u
				}, n.memoizedState = {
					baseLanes: o,
					cachePool: u
				}, e !== null && Kl(n, null), Du(n), Uu(n), e !== null && He(e, n, i, !0), n.childLanes = s, null;
			}
			function sc(e, n) {
				var o = n.hidden;
				return o !== void 0 && console.error(`<Activity> doesn't accept a hidden prop. Use mode="hidden" instead.
- <Activity %s>
+ <Activity %s>`, o === !0 ? "hidden" : o === !1 ? "hidden={false}" : "hidden={...}", o ? "mode=\"hidden\"" : "mode=\"visible\""), n = xs({
					mode: n.mode,
					children: n.children
				}, e.mode), n.ref = e.ref, e.child = n, n.return = e, n;
			}
			function Zp(e, n, o) {
				return ou(n, e.child, null, o), e = sc(n, n.pendingProps), e.flags |= 2, et(n), n.memoizedState = null, e;
			}
			function Nm(e, n, o) {
				var i = n.pendingProps, s = (n.flags & 128) !== 0;
				if (n.flags &= -129, e === null) {
					if (ge) {
						if (i.mode === "hidden") return e = sc(n, i), n.lanes = 536870912, Ss(null, e);
						if (Wu(n), (e = Ke) ? (o = ce(e, oo), o !== null && (i = {
							dehydrated: o,
							treeContext: Ul(),
							retryLane: 536870912,
							hydrationErrors: null
						}, n.memoizedState = i, i = Xa(o), i.return = n, n.child = i, it = n, Ke = null)) : o = null, o === null) throw Ni(n, e), Fr(n);
						return n.lanes = 536870912, null;
					}
					return sc(n, i);
				}
				var u = e.memoizedState;
				if (u !== null) {
					var f = u.dehydrated;
					if (Wu(n), s) if (n.flags & 256) n.flags &= -257, n = Zp(e, n, o);
					else if (n.memoizedState !== null) n.child = e.child, n.flags |= 128, n = null;
					else throw Error("Client rendering an Activity suspended it again. This is a bug in React.");
					else if (vo(), o & 536870912 && wc(n), Cn || He(e, n, o, !1), s = (o & e.childLanes) !== 0, Cn || s) {
						if (i = je, i !== null && (f = Al(i, o), f !== 0 && f !== u.retryLane)) throw u.retryLane = f, On(e, f), We(i, e, f), Tg;
						Pc(), n = Zp(e, n, o);
					} else e = u.treeContext, qn && (Ke = Gc(f), it = n, ge = !0, kl = null, xa = !1, Tr = null, oo = !1, e !== null && Hd(n, e)), n = sc(n, i), n.flags |= 4096;
					return n;
				}
				return u = e.child, i = {
					mode: i.mode,
					children: i.children
				}, o & 536870912 && (o & e.lanes) !== 0 && wc(n), e = Fo(u, i), e.ref = n.ref, n.child = e, e.return = n, e;
			}
			function uc(e, n) {
				var o = n.ref;
				if (o === null) e !== null && e.ref !== null && (n.flags |= 4194816);
				else {
					if (typeof o != "function" && typeof o != "object") throw Error("Expected ref to be a function, an object returned by React.createRef(), or undefined/null.");
					(e === null || e.ref !== o) && (n.flags |= 4194816);
				}
			}
			function ks(e, n, o, i, s) {
				if (o.prototype && typeof o.prototype.render == "function") {
					var u = $e(o) || "Unknown";
					$y[u] || (console.error("The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.", u, u), $y[u] = !0);
				}
				return n.mode & 8 && Mo.recordLegacyContextWarning(n, null), e === null && (Eo(n, n.type), o.contextTypes && (u = $e(o) || "Unknown", qy[u] || (qy[u] = !0, console.error("%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)", u)))), sr(n), o = It(e, n, o, i, void 0, s), i = Mu(), e !== null && !Cn ? (Qu(e, n, s), vr(e, n, s)) : (ge && i && Ei(n), n.flags |= 1, rn(e, n, o, s), n.child);
			}
			function Qr(e, n, o, i, s, u) {
				return sr(n), vi = -1, gp = e !== null && e.type !== n.type, n.updateQueue = null, o = Ou(n, i, o, s), cs(e, n), i = Mu(), e !== null && !Cn ? (Qu(e, n, u), vr(e, n, u)) : (ge && i && Ei(n), n.flags |= 1, rn(e, n, o, u), n.child);
			}
			function yf(e, n, o, i, s) {
				switch (pu(n)) {
					case !1:
						var u = n.stateNode, f = new n.type(n.memoizedProps, u.context).state;
						u.updater.enqueueSetState(u, f, null);
						break;
					case !0:
						n.flags |= 128, n.flags |= 65536, u = Error("Simulated error coming from DevTools");
						var p = s & -s;
						if (n.lanes |= p, f = je, f === null) throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
						p = ac(p), ic(p, f, n, ft(u, n)), Ua(n, p);
				}
				if (sr(n), n.stateNode === null) {
					if (f = Oe, u = o.contextType, "contextType" in o && u !== null && (u === void 0 || u.$$typeof !== on) && !My.has(o) && (My.add(o), p = u === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof u != "object" ? " However, it is set to a " + typeof u + "." : u.$$typeof === ei ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(u).join(", ") + "}.", console.error("%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s", $e(o) || "Component", p)), typeof u == "object" && u !== null && (f = Ee(u)), u = new o(i, f), n.mode & 8) {
						De(!0);
						try {
							u = new o(i, f);
						} finally {
							De(!1);
						}
					}
					if (f = n.memoizedState = u.state !== null && u.state !== void 0 ? u.state : null, u.updater = zg, n.stateNode = u, u._reactInternals = n, u._reactInternalInstance = Fy, typeof o.getDerivedStateFromProps == "function" && f === null && (f = $e(o) || "Component", Ay.has(f) || (Ay.add(f), console.error("`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.", f, u.state === null ? "null" : "undefined", f))), typeof o.getDerivedStateFromProps == "function" || typeof u.getSnapshotBeforeUpdate == "function") {
						var g = p = f = null;
						if (typeof u.componentWillMount == "function" && u.componentWillMount.__suppressDeprecationWarning !== !0 ? f = "componentWillMount" : typeof u.UNSAFE_componentWillMount == "function" && (f = "UNSAFE_componentWillMount"), typeof u.componentWillReceiveProps == "function" && u.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? p = "componentWillReceiveProps" : typeof u.UNSAFE_componentWillReceiveProps == "function" && (p = "UNSAFE_componentWillReceiveProps"), typeof u.componentWillUpdate == "function" && u.componentWillUpdate.__suppressDeprecationWarning !== !0 ? g = "componentWillUpdate" : typeof u.UNSAFE_componentWillUpdate == "function" && (g = "UNSAFE_componentWillUpdate"), f !== null || p !== null || g !== null) {
							u = $e(o) || "Component";
							var S = typeof o.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
							Dy.has(u) || (Dy.add(u), console.error(`Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`, u, S, f !== null ? `
  ` + f : "", p !== null ? `
  ` + p : "", g !== null ? `
  ` + g : ""));
						}
					}
					u = n.stateNode, f = $e(o) || "Component", u.render || (o.prototype && typeof o.prototype.render == "function" ? console.error("No `render` method found on the %s instance: did you accidentally return an object from the constructor?", f) : console.error("No `render` method found on the %s instance: you may have forgotten to define `render`.", f)), !u.getInitialState || u.getInitialState.isReactClassApproved || u.state || console.error("getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?", f), u.getDefaultProps && !u.getDefaultProps.isReactClassApproved && console.error("getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.", f), u.contextType && console.error("contextType was defined as an instance property on %s. Use a static property to define contextType instead.", f), o.childContextTypes && !Oy.has(o) && (Oy.add(o), console.error("%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)", f)), o.contextTypes && !By.has(o) && (By.add(o), console.error("%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)", f)), typeof u.componentShouldUpdate == "function" && console.error("%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.", f), o.prototype && o.prototype.isPureReactComponent && typeof u.shouldComponentUpdate < "u" && console.error("%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.", $e(o) || "A pure component"), typeof u.componentDidUnmount == "function" && console.error("%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?", f), typeof u.componentDidReceiveProps == "function" && console.error("%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().", f), typeof u.componentWillRecieveProps == "function" && console.error("%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?", f), typeof u.UNSAFE_componentWillRecieveProps == "function" && console.error("%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?", f), p = u.props !== i, u.props !== void 0 && p && console.error("When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.", f), u.defaultProps && console.error("Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.", f, f), typeof u.getSnapshotBeforeUpdate != "function" || typeof u.componentDidUpdate == "function" || jy.has(o) || (jy.add(o), console.error("%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.", $e(o))), typeof u.getDerivedStateFromProps == "function" && console.error("%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.", f), typeof u.getDerivedStateFromError == "function" && console.error("%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.", f), typeof o.getSnapshotBeforeUpdate == "function" && console.error("%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.", f), (p = u.state) && (typeof p != "object" || fn(p)) && console.error("%s.state: must be set to an object or null", f), typeof u.getChildContext == "function" && typeof o.childContextTypes != "object" && console.error("%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().", f), u = n.stateNode, u.props = i, u.state = n.memoizedState, u.refs = {}, Au(n), f = o.contextType, u.context = typeof f == "object" && f !== null ? Ee(f) : Oe, u.state === i && (f = $e(o) || "Component", Wy.has(f) || (Wy.add(f), console.error("%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.", f))), n.mode & 8 && Mo.recordLegacyContextWarning(n, u), Mo.recordUnsafeLifecycleWarnings(n, u), u.state = n.memoizedState, f = o.getDerivedStateFromProps, typeof f == "function" && (rc(n, o, f, i), u.state = n.memoizedState), typeof o.getDerivedStateFromProps == "function" || typeof u.getSnapshotBeforeUpdate == "function" || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (f = u.state, typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount(), f !== u.state && (console.error("%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.", G(n) || "Component"), zg.enqueueReplaceState(u, u.state, null)), is(n, i, u, s), Oi(), u.state = n.memoizedState), typeof u.componentDidMount == "function" && (n.flags |= 4194308), (n.mode & 16) !== Z && (n.flags |= 134217728), u = !0;
				} else if (e === null) {
					u = n.stateNode;
					var T = n.memoizedProps;
					p = Mr(o, T), u.props = p;
					var _ = u.context;
					g = o.contextType, f = Oe, typeof g == "object" && g !== null && (f = Ee(g)), S = o.getDerivedStateFromProps, g = typeof S == "function" || typeof u.getSnapshotBeforeUpdate == "function", T = n.pendingProps !== T, g || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (T || _ !== f) && Qa(n, u, i, f), Cl = !1;
					var I = n.memoizedState;
					u.state = I, is(n, i, u, s), Oi(), _ = n.memoizedState, T || I !== _ || Cl ? (typeof S == "function" && (rc(n, o, S, i), _ = n.memoizedState), (p = Cl || ff(n, o, p, i, I, _, f)) ? (g || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount()), typeof u.componentDidMount == "function" && (n.flags |= 4194308), (n.mode & 16) !== Z && (n.flags |= 134217728)) : (typeof u.componentDidMount == "function" && (n.flags |= 4194308), (n.mode & 16) !== Z && (n.flags |= 134217728), n.memoizedProps = i, n.memoizedState = _), u.props = i, u.state = _, u.context = f, u = p) : (typeof u.componentDidMount == "function" && (n.flags |= 4194308), (n.mode & 16) !== Z && (n.flags |= 134217728), u = !1);
				} else {
					u = n.stateNode, ju(e, n), f = n.memoizedProps, g = Mr(o, f), u.props = g, S = n.pendingProps, I = u.context, _ = o.contextType, p = Oe, typeof _ == "object" && _ !== null && (p = Ee(_)), T = o.getDerivedStateFromProps, (_ = typeof T == "function" || typeof u.getSnapshotBeforeUpdate == "function") || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (f !== S || I !== p) && Qa(n, u, i, p), Cl = !1, I = n.memoizedState, u.state = I, is(n, i, u, s), Oi();
					var O = n.memoizedState;
					f !== S || I !== O || Cl || e !== null && e.dependencies !== null && ja(e.dependencies) ? (typeof T == "function" && (rc(n, o, T, i), O = n.memoizedState), (g = Cl || ff(n, o, g, i, I, O, p) || e !== null && e.dependencies !== null && ja(e.dependencies)) ? (_ || typeof u.UNSAFE_componentWillUpdate != "function" && typeof u.componentWillUpdate != "function" || (typeof u.componentWillUpdate == "function" && u.componentWillUpdate(i, O, p), typeof u.UNSAFE_componentWillUpdate == "function" && u.UNSAFE_componentWillUpdate(i, O, p)), typeof u.componentDidUpdate == "function" && (n.flags |= 4), typeof u.getSnapshotBeforeUpdate == "function" && (n.flags |= 1024)) : (typeof u.componentDidUpdate != "function" || f === e.memoizedProps && I === e.memoizedState || (n.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || f === e.memoizedProps && I === e.memoizedState || (n.flags |= 1024), n.memoizedProps = i, n.memoizedState = O), u.props = i, u.state = O, u.context = p, u = g) : (typeof u.componentDidUpdate != "function" || f === e.memoizedProps && I === e.memoizedState || (n.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || f === e.memoizedProps && I === e.memoizedState || (n.flags |= 1024), u = !1);
				}
				if (p = u, uc(e, n), f = (n.flags & 128) !== 0, p || f) {
					if (p = n.stateNode, Ql(n), f && typeof o.getDerivedStateFromError != "function") o = null, Dt = -1;
					else if (o = cy(p), n.mode & 8) {
						De(!0);
						try {
							cy(p);
						} finally {
							De(!1);
						}
					}
					n.flags |= 1, e !== null && f ? (n.child = ou(n, e.child, null, s), n.child = ou(n, null, o, s)) : rn(e, n, o, s), n.memoizedState = p.state, e = n.child;
				} else e = vr(e, n, s);
				return s = n.stateNode, u && s.props !== i && (vd || console.error("It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.", G(n) || "a component"), vd = !0), e;
			}
			function ws(e, n, o, i) {
				return wo(), n.flags |= 256, rn(e, n, o, i), n.child;
			}
			function Eo(e, n) {
				n && n.childContextTypes && console.error(`childContextTypes cannot be defined on a function component.
  %s.childContextTypes = ...`, n.displayName || n.name || "Component"), typeof n.getDerivedStateFromProps == "function" && (e = $e(n) || "Unknown", Gy[e] || (console.error("%s: Function components do not support getDerivedStateFromProps.", e), Gy[e] = !0)), typeof n.contextType == "object" && n.contextType !== null && (n = $e(n) || "Unknown", Vy[n] || (console.error("%s: Function components do not support contextType.", n), Vy[n] = !0));
			}
			function Ps(e) {
				return {
					baseLanes: e,
					cachePool: Iu()
				};
			}
			function cc(e, n, o) {
				return e = e !== null ? e.childLanes & ~o : 0, n && (e |= rr), e;
			}
			function dc(e, n, o) {
				var i = n.pendingProps;
				fu(n) && (n.flags |= 128);
				var s = !1, u = (n.flags & 128) !== 0, f;
				if ((f = u) || (f = e !== null && e.memoizedState === null ? !1 : (Sn.current & hp) !== 0), f && (s = !0, n.flags &= -129), f = (n.flags & 32) !== 0, n.flags &= -33, e === null) {
					if (ge) {
						if (s ? Ur(n) : mr(n), (e = Ke) ? (o = Ne(e, oo), o !== null && (f = {
							dehydrated: o,
							treeContext: Ul(),
							retryLane: 536870912,
							hydrationErrors: null
						}, n.memoizedState = f, f = Xa(o), f.return = n, n.child = f, it = n, Ke = null)) : o = null, o === null) throw Ni(n, e), Fr(n);
						return $c(o) ? n.lanes = 32 : n.lanes = 536870912, null;
					}
					var p = i.children;
					return i = i.fallback, s ? (mr(n), s = n.mode, p = xs({
						mode: "hidden",
						children: p
					}, s), i = fa(i, s, o, null), p.return = n, i.return = n, p.sibling = i, n.child = p, i = n.child, i.memoizedState = Ps(o), i.childLanes = cc(e, f, o), n.memoizedState = _g, Ss(null, i)) : (Ur(n), bf(n, p));
				}
				var g = e.memoizedState;
				if (g !== null && (p = g.dehydrated, p !== null)) {
					if (u) n.flags & 256 ? (Ur(n), n.flags &= -257, n = fc(e, n, o)) : n.memoizedState !== null ? (mr(n), n.child = e.child, n.flags |= 128, n = null) : (mr(n), p = i.fallback, s = n.mode, i = xs({
						mode: "visible",
						children: i.children
					}, s), p = fa(p, s, o, null), p.flags |= 2, i.return = n, p.return = n, i.sibling = p, n.child = i, ou(n, e.child, null, o), i = n.child, i.memoizedState = Ps(o), i.childLanes = cc(e, f, o), n.memoizedState = _g, n = Ss(null, i));
					else if (Ur(n), vo(), o & 536870912 && wc(n), $c(p)) s = Pn(p), f = s.digest, p = s.message, i = s.stack, s = s.componentStack, p = Error(p || "The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering."), p.stack = i || "", p.digest = f, f = s === void 0 ? null : s, i = {
						value: p,
						source: null,
						stack: f
					}, typeof f == "string" && tg.set(p, i), Fi(i), n = fc(e, n, o);
					else if (Cn || He(e, n, o, !1), f = (o & e.childLanes) !== 0, Cn || f) {
						if (f = je, f !== null && (i = Al(f, o), i !== 0 && i !== g.retryLane)) throw g.retryLane = i, On(e, i), We(f, e, i), Tg;
						Ms(p) || Pc(), n = fc(e, n, o);
					} else Ms(p) ? (n.flags |= 192, n.child = e.child, n = null) : (e = g.treeContext, qn && (Ke = Jc(p), it = n, ge = !0, kl = null, xa = !1, Tr = null, oo = !1, e !== null && Hd(n, e)), n = bf(n, i.children), n.flags |= 4096);
					return n;
				}
				return s ? (mr(n), p = i.fallback, s = n.mode, g = e.child, u = g.sibling, i = Fo(g, {
					mode: "hidden",
					children: i.children
				}), i.subtreeFlags = g.subtreeFlags & 65011712, u !== null ? p = Fo(u, p) : (p = fa(p, s, o, null), p.flags |= 2), p.return = n, i.return = n, i.sibling = p, n.child = i, Ss(null, i), i = n.child, p = e.child.memoizedState, p === null ? p = Ps(o) : (s = p.cachePool, s !== null ? (g = at ? un._currentValue : un._currentValue2, s = s.parent !== g ? {
					parent: g,
					pool: g
				} : s) : s = Iu(), p = {
					baseLanes: p.baseLanes | o,
					cachePool: s
				}), i.memoizedState = p, i.childLanes = cc(e, f, o), n.memoizedState = _g, Ss(e.child, i)) : (g !== null && (o & 62914560) === o && (o & e.lanes) !== 0 && wc(n), Ur(n), o = e.child, e = o.sibling, o = Fo(o, {
					mode: "visible",
					children: i.children
				}), o.return = n, o.sibling = null, e !== null && (f = n.deletions, f === null ? (n.deletions = [e], n.flags |= 16) : f.push(e)), n.child = o, n.memoizedState = null, o);
			}
			function bf(e, n) {
				return n = xs({
					mode: "visible",
					children: n
				}, e.mode), n.return = e, e.child = n;
			}
			function xs(e, n) {
				return e = lt(22, e, null, n), e.lanes = 0, e;
			}
			function fc(e, n, o) {
				return ou(n, e.child, null, o), e = bf(n, n.pendingProps.children), e.flags |= 2, n.memoizedState = null, e;
			}
			function vf(e, n, o) {
				e.lanes |= n;
				var i = e.alternate;
				i !== null && (i.lanes |= n), Vl(e.return, n, o);
			}
			function pc(e, n, o, i, s, u) {
				var f = e.memoizedState;
				f === null ? e.memoizedState = {
					isBackwards: n,
					rendering: null,
					renderingStartTime: 0,
					last: i,
					tail: o,
					tailMode: s,
					treeForkCount: u
				} : (f.isBackwards = n, f.rendering = null, f.renderingStartTime = 0, f.last = i, f.tail = o, f.tailMode = s, f.treeForkCount = u);
			}
			function Sf(e, n, o) {
				var _s2;
				var i = n.pendingProps, s = i.revealOrder, u = i.tail, f = i.children, p = Sn.current;
				if ((i = (p & hp) !== 0) ? (p = p & md | hp, n.flags |= 128) : p &= md, pe(Sn, p, n), p = (_s2 = s) != null ? _s2 : "null", s !== "forwards" && s !== "unstable_legacy-backwards" && s !== "together" && s !== "independent" && !Jy[p]) if (Jy[p] = !0, s == null) console.error("The default for the <SuspenseList revealOrder=\"...\"> prop is changing. To be future compatible you must explictly specify either \"independent\" (the current default), \"together\", \"forwards\" or \"legacy_unstable-backwards\".");
				else if (s === "backwards") console.error("The rendering order of <SuspenseList revealOrder=\"backwards\"> is changing. To be future compatible you must specify revealOrder=\"legacy_unstable-backwards\" instead.");
				else if (typeof s == "string") switch (s.toLowerCase()) {
					case "together":
					case "forwards":
					case "backwards":
					case "independent":
						console.error("\"%s\" is not a valid value for revealOrder on <SuspenseList />. Use lowercase \"%s\" instead.", s, s.toLowerCase());
						break;
					case "forward":
					case "backward":
						console.error("\"%s\" is not a valid value for revealOrder on <SuspenseList />. React uses the -s suffix in the spelling. Use \"%ss\" instead.", s, s.toLowerCase());
						break;
					default: console.error("\"%s\" is not a supported revealOrder on <SuspenseList />. Did you mean \"independent\", \"together\", \"forwards\" or \"backwards\"?", s);
				}
				else console.error("%s is not a supported value for revealOrder on <SuspenseList />. Did you mean \"independent\", \"together\", \"forwards\" or \"backwards\"?", s);
				p = u != null ? u : "null", fm[p] || (u == null ? (s === "forwards" || s === "backwards" || s === "unstable_legacy-backwards") && (fm[p] = !0, console.error("The default for the <SuspenseList tail=\"...\"> prop is changing. To be future compatible you must explictly specify either \"visible\" (the current default), \"collapsed\" or \"hidden\".")) : u !== "visible" && u !== "collapsed" && u !== "hidden" ? (fm[p] = !0, console.error("\"%s\" is not a supported value for tail on <SuspenseList />. Did you mean \"visible\", \"collapsed\" or \"hidden\"?", u)) : s !== "forwards" && s !== "backwards" && s !== "unstable_legacy-backwards" && (fm[p] = !0, console.error("<SuspenseList tail=\"%s\" /> is only valid if revealOrder is \"forwards\" or \"backwards\". Did you mean to specify revealOrder=\"forwards\"?", u)));
				e: if ((s === "forwards" || s === "backwards" || s === "unstable_legacy-backwards") && f !== void 0 && f !== null && f !== !1) if (fn(f)) {
					for (p = 0; p < f.length; p++) if (!Zd(f[p], p)) break e;
				} else if (p = Yo(f), typeof p == "function") {
					if (p = p.call(f)) for (var g = p.next(), S = 0; !g.done; g = p.next()) {
						if (!Zd(g.value, S)) break e;
						S++;
					}
				} else console.error("A single row was passed to a <SuspenseList revealOrder=\"%s\" />. This is not useful since it needs multiple rows. Did you mean to pass multiple children or an array?", s);
				if (rn(e, n, f, o), ge ? (mo(), f = Xf) : f = 0, !i && e !== null && (e.flags & 128) !== 0) e: for (e = n.child; e !== null;) {
					if (e.tag === 13) e.memoizedState !== null && vf(e, o, n);
					else if (e.tag === 19) vf(e, o, n);
					else if (e.child !== null) {
						e.child.return = e, e = e.child;
						continue;
					}
					if (e === n) break e;
					for (; e.sibling === null;) {
						if (e.return === null || e.return === n) break e;
						e = e.return;
					}
					e.sibling.return = e.return, e = e.sibling;
				}
				switch (s) {
					case "forwards":
						for (o = n.child, s = null; o !== null;) e = o.alternate, e !== null && us(e) === null && (s = o), o = o.sibling;
						o = s, o === null ? (s = n.child, n.child = null) : (s = o.sibling, o.sibling = null), pc(n, !1, s, o, u, f);
						break;
					case "backwards":
					case "unstable_legacy-backwards":
						for (o = null, s = n.child, n.child = null; s !== null;) {
							if (e = s.alternate, e !== null && us(e) === null) {
								n.child = s;
								break;
							}
							e = s.sibling, s.sibling = o, o = s, s = e;
						}
						pc(n, !0, o, null, u, f);
						break;
					case "together":
						pc(n, !1, null, null, void 0, f);
						break;
					default: n.memoizedState = null;
				}
				return n.child;
			}
			function vr(e, n, o) {
				if (e !== null && (n.dependencies = e.dependencies), Dt = -1, Rl |= n.lanes, (o & n.childLanes) === 0) if (e !== null) {
					if (He(e, n, o, !1), (o & n.childLanes) === 0) return null;
				} else return null;
				if (e !== null && n.child !== e.child) throw Error("Resuming work not yet implemented.");
				if (n.child !== null) {
					for (e = n.child, o = Fo(e, e.pendingProps), n.child = o, o.return = n; e.sibling !== null;) e = e.sibling, o = o.sibling = Fo(e, e.pendingProps), o.return = n;
					o.sibling = null;
				}
				return n.child;
			}
			function ie(e, n) {
				return (e.lanes & n) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && ja(e)));
			}
			function Fm(e, n, o) {
				switch (n.tag) {
					case 3:
						Bl(n, n.stateNode.containerInfo), Hr(n, un, e.memoizedState.cache), wo();
						break;
					case 27:
					case 5:
						La(n);
						break;
					case 4:
						Bl(n, n.stateNode.containerInfo);
						break;
					case 10:
						Hr(n, n.type, n.memoizedProps.value);
						break;
					case 12:
						(o & n.childLanes) !== 0 && (n.flags |= 4), n.flags |= 2048;
						var i = n.stateNode;
						i.effectDuration = -0, i.passiveEffectDuration = -0;
						break;
					case 31:
						if (n.memoizedState !== null) return n.flags |= 128, Wu(n), null;
						break;
					case 13:
						if (i = n.memoizedState, i !== null) return i.dehydrated !== null ? (Ur(n), n.flags |= 128, null) : (o & n.child.childLanes) !== 0 ? dc(e, n, o) : (Ur(n), e = vr(e, n, o), e !== null ? e.sibling : null);
						Ur(n);
						break;
					case 19:
						var s = (e.flags & 128) !== 0;
						if (i = (o & n.childLanes) !== 0, i || (He(e, n, o, !1), i = (o & n.childLanes) !== 0), s) {
							if (i) return Sf(e, n, o);
							n.flags |= 128;
						}
						if (s = n.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), pe(Sn, Sn.current, n), i) break;
						return null;
					case 22: return n.lanes = 0, lc(e, n, o, n.pendingProps);
					case 24: Hr(n, un, e.memoizedState.cache);
				}
				return vr(e, n, o);
			}
			function tt(e, n, o) {
				if (n._debugNeedsRemount && e !== null) {
					o = _c(n.type, n.key, n.pendingProps, n._debugOwner || null, n.mode, n.lanes), o._debugStack = n._debugStack, o._debugTask = n._debugTask;
					var i = n.return;
					if (i === null) throw Error("Cannot swap the root fiber.");
					if (e.alternate = null, n.alternate = null, o.index = n.index, o.sibling = n.sibling, o.return = n.return, o.ref = n.ref, o._debugInfo = n._debugInfo, n === i.child) i.child = o;
					else {
						var s = i.child;
						if (s === null) throw Error("Expected parent to have a child.");
						for (; s.sibling !== n;) if (s = s.sibling, s === null) throw Error("Expected to find the previous sibling.");
						s.sibling = o;
					}
					return n = i.deletions, n === null ? (i.deletions = [e], i.flags |= 16) : n.push(e), o.flags |= 2, o;
				}
				if (e !== null) if (e.memoizedProps !== n.pendingProps || n.type !== e.type) Cn = !0;
				else {
					if (!ie(e, o) && (n.flags & 128) === 0) return Cn = !1, Fm(e, n, o);
					Cn = (e.flags & 131072) !== 0;
				}
				else Cn = !1, (i = ge) && (mo(), i = (n.flags & 1048576) !== 0), i && (i = n.index, mo(), wu(n, Xf, i));
				switch (n.lanes = 0, n.tag) {
					case 16:
						e: if (i = n.pendingProps, e = xo(n.elementType), n.type = e, typeof e == "function") Tc(e) ? (i = Mr(e, i), n.tag = 1, n.type = e = Ya(e), n = yf(null, n, e, i, o)) : (n.tag = 0, Eo(n, e), n.type = e = Ya(e), n = ks(null, n, e, i, o));
						else {
							if (e != null) {
								if (s = e.$$typeof, s === jn) {
									n.tag = 11, n.type = e = Cc(e), n = hf(null, n, e, i, o);
									break e;
								} else if (s === al) {
									n.tag = 14, n = mf(null, n, e, i, o);
									break e;
								}
							}
							throw n = "", e !== null && typeof e == "object" && e.$$typeof === kt && (n = " Did you wrap a component in React.lazy() more than once?"), e = $e(e) || e, Error("Element type is invalid. Received a promise that resolves to: " + e + ". Lazy element type must resolve to a class or function." + n);
						}
						return n;
					case 0: return ks(e, n, n.type, n.pendingProps, o);
					case 1: return i = n.type, s = Mr(i, n.pendingProps), yf(e, n, i, s, o);
					case 3:
						e: {
							if (Bl(n, n.stateNode.containerInfo), e === null) throw Error("Should have a current fiber. This is a bug in React.");
							var u = n.pendingProps;
							s = n.memoizedState, i = s.element, ju(e, n), is(n, u, null, o);
							var f = n.memoizedState;
							if (u = f.cache, Hr(n, un, u), u !== s.cache && Ln(n, [un], o, !0), Oi(), u = f.element, qn && s.isDehydrated) if (s = {
								element: u,
								isDehydrated: !1,
								cache: f.cache
							}, n.updateQueue.baseState = s, n.memoizedState = s, n.flags & 256) {
								n = ws(e, n, u, o);
								break e;
							} else if (u !== i) {
								i = ft(Error("This root received an early update, before anything was able hydrate. Switched the entire root to client rendering."), n), Fi(i), n = ws(e, n, u, o);
								break e;
							} else for (qn && (Ke = qc(n.stateNode.containerInfo), it = n, ge = !0, kl = null, xa = !1, Tr = null, oo = !0), e = xy(n, null, u, o), n.child = e; e;) e.flags = e.flags & -3 | 4096, e = e.sibling;
							else {
								if (wo(), u === i) {
									n = vr(e, n, o);
									break e;
								}
								rn(e, n, u, o);
							}
							n = n.child;
						}
						return n;
					case 26: if (Re) return uc(e, n), e === null ? (e = no(n.type, null, n.pendingProps, null)) ? n.memoizedState = e : ge || (n.stateNode = t(n.type, n.pendingProps, pt(Sl.current), n)) : n.memoizedState = no(n.type, e.memoizedProps, n.pendingProps, e.memoizedState), null;
					case 27: if (d) return La(n), e === null && d && ge && (s = pt(Sl.current), i = Rt(), s = n.stateNode = h(n.type, n.pendingProps, s, i, !1), xa || (i = Vs(s, n.type, n.pendingProps, i), i !== null && (bo(n, 0).serverProps = i)), it = n, oo = !0, Ke = Zc(n.type, s, Ke)), rn(e, n, n.pendingProps.children, o), uc(e, n), e === null && (n.flags |= 4194304), n.child;
					case 5: return e === null && ge && (u = Rt(), i = Xc(n.type, n.pendingProps, u), s = Ke, (f = !s) || (f = Qs(s, n.type, n.pendingProps, oo), f !== null ? (n.stateNode = f, xa || (u = Vs(f, n.type, n.pendingProps, u), u !== null && (bo(n, 0).serverProps = u)), it = n, Ke = Vc(f), oo = !1, u = !0) : u = !1, f = !u), f && (i && Ni(n, s), Fr(n))), La(n), s = n.type, u = n.pendingProps, f = e !== null ? e.memoizedProps : null, i = u.children, ue(s, u) ? i = null : f !== null && ue(s, f) && (n.flags |= 32), n.memoizedState !== null && (s = It(e, n, ef, null, null, o), at ? Kt._currentValue = s : Kt._currentValue2 = s), uc(e, n), rn(e, n, i, o), n.child;
					case 6: return e === null && ge && (e = n.pendingProps, o = Rt(), e = va(e, o), o = Ke, (i = !o) || (i = Ym(o, n.pendingProps, oo), i !== null ? (n.stateNode = i, it = n, Ke = null, i = !0) : i = !1, i = !i), i && (e && Ni(n, o), Fr(n))), null;
					case 13: return dc(e, n, o);
					case 4: return Bl(n, n.stateNode.containerInfo), i = n.pendingProps, e === null ? n.child = ou(n, null, i, o) : rn(e, n, i, o), n.child;
					case 11: return hf(e, n, n.type, n.pendingProps, o);
					case 7: return rn(e, n, n.pendingProps, o), n.child;
					case 8: return rn(e, n, n.pendingProps.children, o), n.child;
					case 12: return n.flags |= 4, n.flags |= 2048, i = n.stateNode, i.effectDuration = -0, i.passiveEffectDuration = -0, rn(e, n, n.pendingProps.children, o), n.child;
					case 10: return i = n.type, s = n.pendingProps, u = s.value, "value" in s || Zy || (Zy = !0, console.error("The `value` prop is required for the `<Context.Provider>`. Did you misspell it or forget to pass it?")), Hr(n, i, u), rn(e, n, s.children, o), n.child;
					case 9: return s = n.type._context, i = n.pendingProps.children, typeof i != "function" && console.error("A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."), sr(n), s = Ee(s), i = hg(i, s, void 0), n.flags |= 1, rn(e, n, i, o), n.child;
					case 14: return mf(e, n, n.type, n.pendingProps, o);
					case 15: return ve(e, n, n.type, n.pendingProps, o);
					case 19: return Sf(e, n, o);
					case 31: return Nm(e, n, o);
					case 22: return lc(e, n, o, n.pendingProps);
					case 24: return sr(n), i = Ee(un), e === null ? (s = Eu(), s === null && (s = je, u = Ai(), s.pooledCache = u, Po(u), u !== null && (s.pooledCacheLanes |= o), s = u), n.memoizedState = {
						parent: i,
						cache: s
					}, Au(n), Hr(n, un, s)) : ((e.lanes & o) !== 0 && (ju(e, n), is(n, null, null, o), Oi()), s = e.memoizedState, u = n.memoizedState, s.parent !== i ? (s = {
						parent: i,
						cache: i
					}, n.memoizedState = s, n.lanes === 0 && (n.memoizedState = n.updateQueue.baseState = s), Hr(n, un, i)) : (i = u.cache, Hr(n, un, i), i !== s.cache && Ln(n, [un], o, !0))), rn(e, n, n.pendingProps.children, o), n.child;
					case 29: throw n.pendingProps;
				}
				throw Error("Unknown unit of work tag (" + n.tag + "). This error is likely caused by a bug in React. Please file an issue.");
			}
			function Lt(e) {
				e.flags |= 4;
			}
			function hc(e) {
				Xr && (e.flags |= 8);
			}
			function zs(e, n) {
				if (e !== null && e.child === n.child) return !1;
				if ((n.flags & 16) !== 0) return !0;
				for (e = n.child; e !== null;) {
					if ((e.flags & 8218) !== 0 || (e.subtreeFlags & 8218) !== 0) return !0;
					e = e.sibling;
				}
				return !1;
			}
			function sa(e, n, o, i) {
				if (Be) for (o = n.child; o !== null;) {
					if (o.tag === 5 || o.tag === 6) bn(e, o.stateNode);
					else if (!(o.tag === 4 || d && o.tag === 27) && o.child !== null) {
						o.child.return = o, o = o.child;
						continue;
					}
					if (o === n) break;
					for (; o.sibling === null;) {
						if (o.return === null || o.return === n) return;
						o = o.return;
					}
					o.sibling.return = o.return, o = o.sibling;
				}
				else if (Xr) for (var s = n.child; s !== null;) {
					if (s.tag === 5) {
						var u = s.stateNode;
						o && i && (u = eo(u, s.type, s.memoizedProps)), bn(e, u);
					} else if (s.tag === 6) u = s.stateNode, o && i && (u = sn(u, s.memoizedProps)), bn(e, u);
					else if (s.tag !== 4) {
						if (s.tag === 22 && s.memoizedState !== null) u = s.child, u !== null && (u.return = s), sa(e, s, !0, !0);
						else if (s.child !== null) {
							s.child.return = s, s = s.child;
							continue;
						}
					}
					if (s === n) break;
					for (; s.sibling === null;) {
						if (s.return === null || s.return === n) return;
						s = s.return;
					}
					s.sibling.return = s.return, s = s.sibling;
				}
			}
			function $a(e, n, o, i) {
				var s = !1;
				if (Xr) for (var u = n.child; u !== null;) {
					if (u.tag === 5) {
						var f = u.stateNode;
						o && i && (f = eo(f, u.type, u.memoizedProps)), Mc(e, f);
					} else if (u.tag === 6) f = u.stateNode, o && i && (f = sn(f, u.memoizedProps)), Mc(e, f);
					else if (u.tag !== 4) {
						if (u.tag === 22 && u.memoizedState !== null) s = u.child, s !== null && (s.return = u), $a(e, u, !0, !0), s = !0;
						else if (u.child !== null) {
							u.child.return = u, u = u.child;
							continue;
						}
					}
					if (u === n) break;
					for (; u.sibling === null;) {
						if (u.return === null || u.return === n) return s;
						u = u.return;
					}
					u.sibling.return = u.return, u = u.sibling;
				}
				return s;
			}
			function kf(e, n) {
				if (Xr && zs(e, n)) {
					e = n.stateNode;
					var o = e.containerInfo, i = Oc();
					$a(i, n, !1, !1), e.pendingChildren = i, Lt(n), hn(o, i);
				}
			}
			function Cs(e, n, o, i) {
				if (Be) e.memoizedProps !== i && Lt(n);
				else if (Xr) {
					var s = e.stateNode, u = e.memoizedProps;
					if ((e = zs(e, n)) || u !== i) {
						var f = Rt();
						u = Qh(s, o, u, i, !e, null), u === s ? n.stateNode = s : (hc(n), Ue(u, o, i, f) && Lt(n), n.stateNode = u, e && sa(u, n, !1, !1));
					} else n.stateNode = s;
				}
			}
			function mc(e, n, o, i, s) {
				if ((e.mode & 32) !== Z && (o === null ? sl(n, i) : ul(n, o, i))) {
					if (e.flags |= 16777216, (s & 335544128) === s || Hc(n, i)) if (ha(e.stateNode, n, i)) e.flags |= 8192;
					else if (Sh()) e.flags |= 8192;
					else throw ru = im, gg;
				} else e.flags &= -16777217;
			}
			function Io(e, n) {
				if (a(n)) {
					if (e.flags |= 16777216, !l(n)) if (Sh()) e.flags |= 8192;
					else throw ru = im, gg;
				} else e.flags &= -16777217;
			}
			function Zi(e, n) {
				n !== null && (e.flags |= 4), e.flags & 16384 && (n = e.tag !== 22 ? ut() : 536870912, e.lanes |= n, uu |= n);
			}
			function Va(e, n) {
				if (!ge) switch (e.tailMode) {
					case "hidden":
						n = e.tail;
						for (var o = null; n !== null;) n.alternate !== null && (o = n), n = n.sibling;
						o === null ? e.tail = null : o.sibling = null;
						break;
					case "collapsed":
						o = e.tail;
						for (var i = null; o !== null;) o.alternate !== null && (i = o), o = o.sibling;
						i === null ? n || e.tail === null ? e.tail = null : e.tail.sibling = null : i.sibling = null;
				}
			}
			function Te(e) {
				var n = e.alternate !== null && e.alternate.child === e.child, o = 0, i = 0;
				if (n) if ((e.mode & 2) !== Z) {
					for (var s = e.selfBaseDuration, u = e.child; u !== null;) o |= u.lanes | u.childLanes, i |= u.subtreeFlags & 65011712, i |= u.flags & 65011712, s += u.treeBaseDuration, u = u.sibling;
					e.treeBaseDuration = s;
				} else for (s = e.child; s !== null;) o |= s.lanes | s.childLanes, i |= s.subtreeFlags & 65011712, i |= s.flags & 65011712, s.return = e, s = s.sibling;
				else if ((e.mode & 2) !== Z) {
					s = e.actualDuration, u = e.selfBaseDuration;
					for (var f = e.child; f !== null;) o |= f.lanes | f.childLanes, i |= f.subtreeFlags, i |= f.flags, s += f.actualDuration, u += f.treeBaseDuration, f = f.sibling;
					e.actualDuration = s, e.treeBaseDuration = u;
				} else for (s = e.child; s !== null;) o |= s.lanes | s.childLanes, i |= s.subtreeFlags, i |= s.flags, s.return = e, s = s.sibling;
				return e.subtreeFlags |= i, e.childLanes = o, n;
			}
			function wf(e, n, o) {
				var i = n.pendingProps;
				switch (Pu(n), n.tag) {
					case 16:
					case 15:
					case 0:
					case 11:
					case 7:
					case 8:
					case 12:
					case 9:
					case 14: return Te(n), null;
					case 1: return Te(n), null;
					case 3: return o = n.stateNode, i = null, e !== null && (i = e.memoizedState.cache), n.memoizedState.cache !== i && (n.flags |= 2048), lr(un, n), Ia(n), o.pendingContext && (o.context = o.pendingContext, o.pendingContext = null), (e === null || e.child === null) && (ko(n) ? (xu(), Lt(n)) : e === null || e.memoizedState.isDehydrated && !(n.flags & 256) || (n.flags |= 1024, $l())), kf(e, n), Te(n), null;
					case 26: if (Re) {
						var s = n.type, u = n.memoizedState;
						return e === null ? (Lt(n), u !== null ? (Te(n), Io(n, u)) : (Te(n), mc(n, s, null, i, o))) : u ? u !== e.memoizedState ? (Lt(n), Te(n), Io(n, u)) : (Te(n), n.flags &= -16777217) : (u = e.memoizedProps, Be ? u !== i && Lt(n) : Cs(e, n, s, i), Te(n), mc(n, s, u, i, o)), null;
					}
					case 27: if (d) {
						if (Na(n), o = pt(Sl.current), s = n.type, e !== null && n.stateNode != null) Be ? e.memoizedProps !== i && Lt(n) : Cs(e, n, s, i);
						else {
							if (!i) {
								if (n.stateNode === null) throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
								return Te(n), null;
							}
							e = Rt(), ko(n) ? So(n, e) : (e = h(s, i, o, e, !0), n.stateNode = e, Lt(n));
						}
						return Te(n), null;
					}
					case 5:
						if (Na(n), s = n.type, e !== null && n.stateNode != null) Cs(e, n, s, i);
						else {
							if (!i) {
								if (n.stateNode === null) throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
								return Te(n), null;
							}
							if (u = Rt(), ko(n)) So(n, u), ii(n.stateNode, s, i, u) && (n.flags |= 64);
							else {
								var f = pt(Sl.current);
								f = Fc(s, i, f, u, n), hc(n), sa(f, n, !1, !1), n.stateNode = f, Ue(f, s, i, u) && Lt(n);
							}
						}
						return Te(n), mc(n, n.type, e === null ? null : e.memoizedProps, n.pendingProps, o), null;
					case 6:
						if (e && n.stateNode != null) o = e.memoizedProps, Be ? o !== i && Lt(n) : Xr && (o !== i ? (e = pt(Sl.current), o = Rt(), hc(n), n.stateNode = Do(i, e, o, n)) : n.stateNode = e.stateNode);
						else {
							if (typeof i != "string" && n.stateNode === null) throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
							if (e = pt(Sl.current), o = Rt(), ko(n)) {
								if (!qn) throw Error("Expected prepareToHydrateHostTextInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
								if (e = n.stateNode, o = n.memoizedProps, s = !xa, i = null, u = it, u !== null) switch (u.tag) {
									case 3:
										s && (s = Zf(e, o, i), s !== null && (bo(n, 0).serverProps = s));
										break;
									case 27:
									case 5: i = u.memoizedProps, s && (s = Zf(e, o, i), s !== null && (bo(n, 0).serverProps = s));
								}
								he(e, o, n, i) || Fr(n, !0);
							} else hc(n), n.stateNode = Do(i, e, o, n);
						}
						return Te(n), null;
					case 31:
						if (o = n.memoizedState, e === null || e.memoizedState !== null) {
							if (i = ko(n), o !== null) {
								if (e === null) {
									if (!i) throw Error("A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.");
									if (!qn) throw Error("Expected prepareToHydrateHostActivityInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
									if (e = n.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error("Expected to have a hydrated activity instance. This error is likely caused by a bug in React. Please file an issue.");
									_e(e, n), Te(n), (n.mode & 2) !== Z && o !== null && (e = n.child, e !== null && (n.treeBaseDuration -= e.treeBaseDuration));
								} else xu(), wo(), !(n.flags & 128) && (o = n.memoizedState = null), n.flags |= 4, Te(n), (n.mode & 2) !== Z && o !== null && (e = n.child, e !== null && (n.treeBaseDuration -= e.treeBaseDuration));
								e = !1;
							} else o = $l(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = o), e = !0;
							if (!e) return n.flags & 256 ? (et(n), n) : (et(n), null);
							if ((n.flags & 128) !== 0) throw Error("Client rendering an Activity suspended it again. This is a bug in React.");
						}
						return Te(n), null;
					case 13:
						if (i = n.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
							if (s = i, u = ko(n), s !== null && s.dehydrated !== null) {
								if (e === null) {
									if (!u) throw Error("A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.");
									if (!qn) throw Error("Expected prepareToHydrateHostSuspenseInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
									if (u = n.memoizedState, u = u !== null ? u.dehydrated : null, !u) throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
									Ht(u, n), Te(n), (n.mode & 2) !== Z && s !== null && (s = n.child, s !== null && (n.treeBaseDuration -= s.treeBaseDuration));
								} else xu(), wo(), !(n.flags & 128) && (s = n.memoizedState = null), n.flags |= 4, Te(n), (n.mode & 2) !== Z && s !== null && (s = n.child, s !== null && (n.treeBaseDuration -= s.treeBaseDuration));
								s = !1;
							} else s = $l(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
							if (!s) return n.flags & 256 ? (et(n), n) : (et(n), null);
						}
						return et(n), (n.flags & 128) !== 0 ? (n.lanes = o, (n.mode & 2) !== Z && Zl(n), n) : (o = i !== null, e = e !== null && e.memoizedState !== null, o && (i = n.child, s = null, i.alternate !== null && i.alternate.memoizedState !== null && i.alternate.memoizedState.cachePool !== null && (s = i.alternate.memoizedState.cachePool.pool), u = null, i.memoizedState !== null && i.memoizedState.cachePool !== null && (u = i.memoizedState.cachePool.pool), u !== s && (i.flags |= 2048)), o !== e && o && (n.child.flags |= 8192), Zi(n, n.updateQueue), Te(n), (n.mode & 2) !== Z && o && (e = n.child, e !== null && (n.treeBaseDuration -= e.treeBaseDuration)), null);
					case 4: return Ia(n), kf(e, n), e === null && qe(n.stateNode.containerInfo), Te(n), null;
					case 10: return lr(n.type, n), Te(n), null;
					case 19:
						if (Ze(Sn, n), i = n.memoizedState, i === null) return Te(n), null;
						if (s = (n.flags & 128) !== 0, u = i.rendering, u === null) if (s) Va(i, !1);
						else {
							if (nn !== ki || e !== null && (e.flags & 128) !== 0) for (e = n.child; e !== null;) {
								if (u = us(e), u !== null) {
									for (n.flags |= 128, Va(i, !1), e = u.updateQueue, n.updateQueue = e, Zi(n, e), n.subtreeFlags = 0, e = o, o = n.child; o !== null;) dn(o, e), o = o.sibling;
									return pe(Sn, Sn.current & md | hp, n), ge && ho(n, i.treeForkCount), n.child;
								}
								e = e.sibling;
							}
							i.tail !== null && me() > Pp && (n.flags |= 128, s = !0, Va(i, !1), n.lanes = 4194304);
						}
						else {
							if (!s) if (e = us(u), e !== null) {
								if (n.flags |= 128, s = !0, e = e.updateQueue, n.updateQueue = e, Zi(n, e), Va(i, !0), i.tail === null && i.tailMode === "hidden" && !u.alternate && !ge) return Te(n), null;
							} else 2 * me() - i.renderingStartTime > Pp && o !== 536870912 && (n.flags |= 128, s = !0, Va(i, !1), n.lanes = 4194304);
							i.isBackwards ? (u.sibling = n.child, n.child = u) : (e = i.last, e !== null ? e.sibling = u : n.child = u, i.last = u);
						}
						return i.tail !== null ? (e = i.tail, i.rendering = e, i.tail = e.sibling, i.renderingStartTime = me(), e.sibling = null, o = Sn.current, o = s ? o & md | hp : o & md, pe(Sn, o, n), ge && ho(n, i.treeForkCount), e) : (Te(n), null);
					case 22:
					case 23: return et(n), ss(n), i = n.memoizedState !== null, e !== null ? e.memoizedState !== null !== i && (n.flags |= 8192) : i && (n.flags |= 8192), i ? o & 536870912 && !(n.flags & 128) && (Te(n), n.subtreeFlags & 6 && (n.flags |= 8192)) : Te(n), o = n.updateQueue, o !== null && Zi(n, o.retryQueue), o = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (o = e.memoizedState.cachePool.pool), i = null, n.memoizedState !== null && n.memoizedState.cachePool !== null && (i = n.memoizedState.cachePool.pool), i !== o && (n.flags |= 2048), e !== null && Ze(nu, n), null;
					case 24: return o = null, e !== null && (o = e.memoizedState.cache), n.memoizedState.cache !== o && (n.flags |= 2048), lr(un, n), Te(n), null;
					case 25: return null;
					case 30: return null;
				}
				throw Error("Unknown unit of work tag (" + n.tag + "). This error is likely caused by a bug in React. Please file an issue.");
			}
			function ua(e, n) {
				switch (Pu(n), n.tag) {
					case 1: return e = n.flags, e & 65536 ? (n.flags = e & -65537 | 128, (n.mode & 2) !== Z && Zl(n), n) : null;
					case 3: return lr(un, n), Ia(n), e = n.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (n.flags = e & -65537 | 128, n) : null;
					case 26:
					case 27:
					case 5: return Na(n), null;
					case 31:
						if (n.memoizedState !== null) {
							if (et(n), n.alternate === null) throw Error("Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.");
							wo();
						}
						return e = n.flags, e & 65536 ? (n.flags = e & -65537 | 128, (n.mode & 2) !== Z && Zl(n), n) : null;
					case 13:
						if (et(n), e = n.memoizedState, e !== null && e.dehydrated !== null) {
							if (n.alternate === null) throw Error("Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.");
							wo();
						}
						return e = n.flags, e & 65536 ? (n.flags = e & -65537 | 128, (n.mode & 2) !== Z && Zl(n), n) : null;
					case 19: return Ze(Sn, n), null;
					case 4: return Ia(n), null;
					case 10: return lr(n.type, n), null;
					case 22:
					case 23: return et(n), ss(n), e !== null && Ze(nu, n), e = n.flags, e & 65536 ? (n.flags = e & -65537 | 128, (n.mode & 2) !== Z && Zl(n), n) : null;
					case 24: return lr(un, n), null;
					case 25: return null;
					default: return null;
				}
			}
			function gc(e, n) {
				switch (Pu(n), n.tag) {
					case 3:
						lr(un, n), Ia(n);
						break;
					case 26:
					case 27:
					case 5:
						Na(n);
						break;
					case 4:
						Ia(n);
						break;
					case 31:
						n.memoizedState !== null && et(n);
						break;
					case 13:
						et(n);
						break;
					case 19:
						Ze(Sn, n);
						break;
					case 10:
						lr(n.type, n);
						break;
					case 22:
					case 23:
						et(n), ss(n), e !== null && Ze(nu, n);
						break;
					case 24: lr(un, n);
				}
			}
			function $r(e) {
				return (e.mode & 2) !== Z;
			}
			function Pf(e, n) {
				$r(e) ? (hr(), ca(n, e), pr()) : ca(n, e);
			}
			function xf(e, n, o) {
				$r(e) ? (hr(), M(o, e, n), pr()) : M(o, e, n);
			}
			function ca(e, n) {
				try {
					var o = n.updateQueue, i = o !== null ? o.lastEffect : null;
					if (i !== null) {
						var s = i.next;
						o = s;
						do {
							if ((o.tag & e) === e && (i = void 0, (e & Wt) !== sm && (zd = !0), i = B(n, Bb, o), (e & Wt) !== sm && (zd = !1), i !== void 0 && typeof i != "function")) {
								var u = void 0;
								u = (o.tag & Rr) !== 0 ? "useLayoutEffect" : (o.tag & Wt) !== 0 ? "useInsertionEffect" : "useEffect";
								var f = void 0;
								f = i === null ? " You returned null. If your effect does not require clean up, return undefined (or nothing)." : typeof i.then == "function" ? `

It looks like you wrote ` + u + `(async () => ...) or returned a Promise. Instead, write the async function inside your effect and call it immediately:

` + u + `(() => {
  async function fetchData() {
    // You can await here
    const response = await MyAPI.getData(someId);
    // ...
  }
  fetchData();
}, [someId]); // Or [] if effect doesn't need props or state

Learn more about data fetching with Hooks: https://react.dev/link/hooks-data-fetching` : " You returned: " + i, B(n, function(p, g) {
									console.error("%s must not return anything besides a function, which is used for clean-up.%s", p, g);
								}, u, f);
							}
							o = o.next;
						} while (o !== s);
					}
				} catch (p) {
					Se(n, n.return, p);
				}
			}
			function M(e, n, o) {
				try {
					var i = n.updateQueue, s = i !== null ? i.lastEffect : null;
					if (s !== null) {
						var u = s.next;
						i = u;
						do {
							if ((i.tag & e) === e) {
								var f = i.inst, p = f.destroy;
								p !== void 0 && (f.destroy = void 0, (e & Wt) !== sm && (zd = !0), s = n, B(s, Ob, s, o, p), (e & Wt) !== sm && (zd = !1));
							}
							i = i.next;
						} while (i !== u);
					}
				} catch (g) {
					Se(n, n.return, g);
				}
			}
			function Yp(e, n) {
				$r(e) ? (hr(), ca(n, e), pr()) : ca(n, e);
			}
			function zf(e, n, o) {
				$r(e) ? (hr(), M(o, e, n), pr()) : M(o, e, n);
			}
			function Cf(e) {
				var n = e.updateQueue;
				if (n !== null) {
					var o = e.stateNode;
					e.type.defaultProps || "ref" in e.memoizedProps || vd || (o.props !== e.memoizedProps && console.error("Expected %s props to match memoized props before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", G(e) || "instance"), o.state !== e.memoizedState && console.error("Expected %s state to match memoized state before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", G(e) || "instance"));
					try {
						B(e, Xd, n, o);
					} catch (i) {
						Se(e, e.return, i);
					}
				}
			}
			function Ts(e, n, o) {
				return e.getSnapshotBeforeUpdate(n, o);
			}
			function Hm(e, n) {
				var o = n.memoizedProps, i = n.memoizedState;
				n = e.stateNode, e.type.defaultProps || "ref" in e.memoizedProps || vd || (n.props !== e.memoizedProps && console.error("Expected %s props to match memoized props before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", G(e) || "instance"), n.state !== e.memoizedState && console.error("Expected %s state to match memoized state before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", G(e) || "instance"));
				try {
					var s = Mr(e.type, o), u = B(e, Ts, n, s, i);
					o = Yy, u !== void 0 || o.has(e.type) || (o.add(e.type), B(e, function() {
						console.error("%s.getSnapshotBeforeUpdate(): A snapshot value (or null) must be returned. You have returned undefined.", G(e));
					})), n.__reactInternalSnapshotBeforeUpdate = u;
				} catch (f) {
					Se(e, e.return, f);
				}
			}
			function Xp(e, n, o) {
				o.props = Mr(e.type, e.memoizedProps), o.state = e.memoizedState, $r(e) ? (hr(), B(e, gy, e, n, o), pr()) : B(e, gy, e, n, o);
			}
			function Am(e) {
				var n = e.ref;
				if (n !== null) {
					switch (e.tag) {
						case 26:
						case 27:
						case 5:
							var o = ot(e.stateNode);
							break;
						case 30:
							o = e.stateNode;
							break;
						default: o = e.stateNode;
					}
					if (typeof n == "function") if ($r(e)) try {
						hr(), e.refCleanup = n(o);
					} finally {
						pr();
					}
					else e.refCleanup = n(o);
					else typeof n == "string" ? console.error("String refs are no longer supported.") : n.hasOwnProperty("current") || console.error("Unexpected ref object provided for %s. Use either a ref-setter function or React.createRef().", G(e)), n.current = o;
				}
			}
			function _s(e, n) {
				try {
					B(e, Am, e);
				} catch (o) {
					Se(e, n, o);
				}
			}
			function Vr(e, n) {
				var o = e.ref, i = e.refCleanup;
				if (o !== null) if (typeof i == "function") try {
					if ($r(e)) try {
						hr(), B(e, i);
					} finally {
						pr(e);
					}
					else B(e, i);
				} catch (s) {
					Se(e, n, s);
				} finally {
					e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
				}
				else if (typeof o == "function") try {
					if ($r(e)) try {
						hr(), B(e, o, null);
					} finally {
						pr(e);
					}
					else B(e, o, null);
				} catch (s) {
					Se(e, n, s);
				}
				else o.current = null;
			}
			function yc(e, n, o, i) {
				var s = e.memoizedProps, u = s.id, f = s.onCommit;
				s = s.onRender, n = n === null ? "mount" : "update", em && (n = "nested-update"), typeof s == "function" && s(u, n, e.actualDuration, e.treeBaseDuration, e.actualStartTime, o), typeof f == "function" && f(u, n, i, o);
			}
			function Kp(e, n, o, i) {
				var s = e.memoizedProps;
				e = s.id, s = s.onPostCommit, n = n === null ? "mount" : "update", em && (n = "nested-update"), typeof s == "function" && s(e, n, i, o);
			}
			function Rs(e) {
				var n = e.type, o = e.memoizedProps, i = e.stateNode;
				try {
					B(e, Ie, i, n, o, e);
				} catch (s) {
					Se(e, e.return, s);
				}
			}
			function bc(e, n, o) {
				try {
					B(e, pn, e.stateNode, e.type, o, n, e);
				} catch (i) {
					Se(e, e.return, i);
				}
			}
			function eh(e) {
				return e.tag === 5 || e.tag === 3 || (Re ? e.tag === 26 : !1) || (d ? e.tag === 27 && j(e.type) : !1) || e.tag === 4;
			}
			function Tf(e) {
				e: for (;;) {
					for (; e.sibling === null;) {
						if (e.return === null || eh(e.return)) return null;
						e = e.return;
					}
					for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
						if (d && e.tag === 27 && j(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
						e.child.return = e, e = e.child;
					}
					if (!(e.flags & 2)) return e.stateNode;
				}
			}
			function Lo(e, n, o) {
				var i = e.tag;
				if (i === 5 || i === 6) e = e.stateNode, n ? dl(o, e, n) : Wo(o, e);
				else if (i !== 4 && (d && i === 27 && j(e.type) && (o = e.stateNode, n = null), e = e.child, e !== null)) for (Lo(e, n, o), e = e.sibling; e !== null;) Lo(e, n, o), e = e.sibling;
			}
			function qt(e, n, o) {
				var i = e.tag;
				if (i === 5 || i === 6) e = e.stateNode, n ? Uc(o, e, n) : ln(o, e);
				else if (i !== 4 && (d && i === 27 && j(e.type) && (o = e.stateNode), e = e.child, e !== null)) for (qt(e, n, o), e = e.sibling; e !== null;) qt(e, n, o), e = e.sibling;
			}
			function $n(e) {
				for (var n, o = e.return; o !== null;) {
					if (eh(o)) {
						n = o;
						break;
					}
					o = o.return;
				}
				if (Be) {
					if (n == null) throw Error("Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.");
					switch (n.tag) {
						case 27: if (d) {
							n = n.stateNode, o = Tf(e), qt(e, o, n);
							break;
						}
						case 5:
							o = n.stateNode, n.flags & 32 && (fl(o), n.flags &= -33), n = Tf(e), qt(e, n, o);
							break;
						case 3:
						case 4:
							n = n.stateNode.containerInfo, o = Tf(e), Lo(e, o, n);
							break;
						default: throw Error("Invalid host parent fiber. This error is likely caused by a bug in React. Please file an issue.");
					}
				}
			}
			function Sr(e, n, o) {
				e = e.containerInfo;
				try {
					B(n, Qc, e, o);
				} catch (i) {
					Se(n, n.return, i);
				}
			}
			function Hn(e) {
				var n = e.stateNode, o = e.memoizedProps;
				try {
					B(e, y, e.type, o, n, e);
				} catch (i) {
					Se(e, e.return, i);
				}
			}
			function nh(e, n) {
				return n.tag === 31 ? (n = n.memoizedState, e.memoizedState !== null && n === null) : n.tag === 13 ? (e = e.memoizedState, n = n.memoizedState, e !== null && e.dehydrated !== null && (n === null || n.dehydrated === null)) : n.tag === 3 ? e.memoizedState.isDehydrated && (n.flags & 256) === 0 : !1;
			}
			function jm(e, n) {
				for (Ws(e.containerInfo), Gn = n; Gn !== null;) if (e = Gn, n = e.child, (e.subtreeFlags & 1028) !== 0 && n !== null) n.return = e, Gn = n;
				else for (; Gn !== null;) {
					n = e = Gn;
					var o = n.alternate, i = n.flags;
					switch (n.tag) {
						case 0:
							if ((i & 4) !== 0 && (n = n.updateQueue, n = n !== null ? n.events : null, n !== null)) for (o = 0; o < n.length; o++) i = n[o], i.ref.impl = i.nextImpl;
							break;
						case 11:
						case 15: break;
						case 1:
							i & 1024 && o !== null && Hm(n, o);
							break;
						case 3:
							i & 1024 && Be && qf(n.stateNode.containerInfo);
							break;
						case 5:
						case 26:
						case 27:
						case 6:
						case 4:
						case 17: break;
						default: if ((i & 1024) !== 0) throw Error("This unit of work tag should not have side-effects. This error is likely caused by a bug in React. Please file an issue.");
					}
					if (n = e.sibling, n !== null) {
						n.return = e.return, Gn = n;
						break;
					}
					Gn = e.return;
				}
			}
			function yn(e, n, o) {
				var i = Xn(), s = Dr(), u = dr(), f = fr(), p = o.flags;
				switch (o.tag) {
					case 0:
					case 11:
					case 15:
						rt(e, o), p & 4 && Pf(o, Rr | lo);
						break;
					case 1:
						if (rt(e, o), p & 4) if (e = o.stateNode, n === null) o.type.defaultProps || "ref" in o.memoizedProps || vd || (e.props !== o.memoizedProps && console.error("Expected %s props to match memoized props before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", G(o) || "instance"), e.state !== o.memoizedState && console.error("Expected %s state to match memoized state before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", G(o) || "instance")), $r(o) ? (hr(), B(o, mg, o, e), pr()) : B(o, mg, o, e);
						else {
							var g = Mr(o.type, n.memoizedProps);
							n = n.memoizedState, o.type.defaultProps || "ref" in o.memoizedProps || vd || (e.props !== o.memoizedProps && console.error("Expected %s props to match memoized props before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", G(o) || "instance"), e.state !== o.memoizedState && console.error("Expected %s state to match memoized state before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", G(o) || "instance")), $r(o) ? (hr(), B(o, py, o, e, g, n, e.__reactInternalSnapshotBeforeUpdate), pr()) : B(o, py, o, e, g, n, e.__reactInternalSnapshotBeforeUpdate);
						}
						p & 64 && Cf(o), p & 512 && _s(o, o.return);
						break;
					case 3:
						if (n = jr(), rt(e, o), p & 64 && (p = o.updateQueue, p !== null)) {
							if (g = null, o.child !== null) switch (o.child.tag) {
								case 27:
								case 5:
									g = ot(o.child.stateNode);
									break;
								case 1: g = o.child.stateNode;
							}
							try {
								B(o, Xd, p, g);
							} catch (T) {
								Se(o, o.return, T);
							}
						}
						e.effectDuration += ql(n);
						break;
					case 27: d && n === null && p & 4 && Hn(o);
					case 26:
					case 5:
						if (rt(e, o), n === null) {
							if (p & 4) Rs(o);
							else if (p & 64) {
								e = o.type, n = o.memoizedProps, g = o.stateNode;
								try {
									B(o, Gf, g, e, n, o);
								} catch (T) {
									Se(o, o.return, T);
								}
							}
						}
						p & 512 && _s(o, o.return);
						break;
					case 12:
						if (p & 4) {
							p = jr(), rt(e, o), e = o.stateNode, e.effectDuration += ji(p);
							try {
								B(o, yc, o, n, wl, e.effectDuration);
							} catch (T) {
								Se(o, o.return, T);
							}
						} else rt(e, o);
						break;
					case 31:
						rt(e, o), p & 4 && th(e, o);
						break;
					case 13:
						rt(e, o), p & 4 && rh(e, o), p & 64 && (e = o.memoizedState, e !== null && (e = e.dehydrated, e !== null && (p = Nh.bind(null, o), mn(e, p))));
						break;
					case 22:
						if (p = o.memoizedState !== null || Si, !p) {
							n = n !== null && n.memoizedState !== null || Tn, g = Si;
							var S = Tn;
							Si = p, (Tn = n) && !S ? (Gr(e, o, (o.subtreeFlags & 8772) !== 0), (o.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && _i(o, $, q)) : rt(e, o), Si = g, Tn = S;
						}
						break;
					case 30: break;
					default: rt(e, o);
				}
				(o.mode & 2) !== Z && 0 <= $ && 0 <= q && ((cn || .05 < en) && Un(o, $, q, en, Je), o.alternate === null && o.return !== null && o.return.alternate !== null && .05 < q - $ && (nh(o.return.alternate, o.return) || Ot(o, $, q, "Mount"))), mt(i), cr(s), Je = u, cn = f;
			}
			function qr(e) {
				var n = e.alternate;
				n !== null && (e.alternate = null, qr(n)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (n = e.stateNode, n !== null && Qf(n)), e.stateNode = null, e._debugOwner = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
			}
			function kr(e, n, o) {
				for (o = o.child; o !== null;) _f(e, n, o), o = o.sibling;
			}
			function _f(e, n, o) {
				if (zt && typeof zt.onCommitFiberUnmount == "function") try {
					zt.onCommitFiberUnmount(td, o);
				} catch (S) {
					ka || (ka = !0, console.error("React instrumentation encountered an error: %o", S));
				}
				var i = Xn(), s = Dr(), u = dr(), f = fr();
				switch (o.tag) {
					case 26: if (Re) {
						Tn || Vr(o, n), kr(e, n, o), o.memoizedState ? ed(o.memoizedState) : o.stateNode && nd(o.stateNode);
						break;
					}
					case 27: if (d) {
						Tn || Vr(o, n);
						var p = _n, g = nr;
						j(o.type) && (_n = o.stateNode, nr = !1), kr(e, n, o), B(o, R, o.stateNode), _n = p, nr = g;
						break;
					}
					case 5: Tn || Vr(o, n);
					case 6:
						if (Be) {
							if (p = _n, g = nr, _n = null, kr(e, n, o), _n = p, nr = g, _n !== null) if (nr) try {
								B(o, Bc, _n, o.stateNode);
							} catch (S) {
								Se(o, n, S);
							}
							else try {
								B(o, oi, _n, o.stateNode);
							} catch (S) {
								Se(o, n, S);
							}
						} else kr(e, n, o);
						break;
					case 18:
						Be && _n !== null && (nr ? hl(_n, o.stateNode) : At(_n, o.stateNode));
						break;
					case 4:
						Be ? (p = _n, g = nr, _n = o.stateNode.containerInfo, nr = !0, kr(e, n, o), _n = p, nr = g) : (Xr && Sr(o.stateNode, o, Oc()), kr(e, n, o));
						break;
					case 0:
					case 11:
					case 14:
					case 15:
						M(Wt, o, n), Tn || xf(o, n, Rr), kr(e, n, o);
						break;
					case 1:
						Tn || (Vr(o, n), p = o.stateNode, typeof p.componentWillUnmount == "function" && Xp(o, n, p)), kr(e, n, o);
						break;
					case 21:
						kr(e, n, o);
						break;
					case 22:
						Tn = (p = Tn) || o.memoizedState !== null, kr(e, n, o), Tn = p;
						break;
					default: kr(e, n, o);
				}
				(o.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(o, $, q, en, Je), mt(i), cr(s), Je = u, cn = f;
			}
			function th(e, n) {
				if (qn && n.memoizedState === null && (e = n.alternate, e !== null && (e = e.memoizedState, e !== null))) {
					e = e.dehydrated;
					try {
						B(n, Xe, e);
					} catch (o) {
						Se(n, n.return, o);
					}
				}
			}
			function rh(e, n) {
				if (qn && n.memoizedState === null && (e = n.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
					B(n, ba, e);
				} catch (o) {
					Se(n, n.return, o);
				}
			}
			function Dm(e) {
				switch (e.tag) {
					case 31:
					case 13:
					case 19:
						var n = e.stateNode;
						return n === null && (n = e.stateNode = new Xy()), n;
					case 22: return e = e.stateNode, n = e._retryCache, n === null && (n = e._retryCache = new Xy()), n;
					default: throw Error("Unexpected Suspense handler tag (" + e.tag + "). This is a bug in React.");
				}
			}
			function Yi(e, n) {
				var o = Dm(e);
				n.forEach(function(i) {
					if (!o.has(i)) {
						if (o.add(i), wa) if (Sd !== null && kd !== null) nl(kd, Sd);
						else throw Error("Expected finished root and lanes to be set. This is a bug in React.");
						var s = $m.bind(null, e, i);
						i.then(s, s);
					}
				});
			}
			function An(e, n) {
				var o = n.deletions;
				if (o !== null) for (var i = 0; i < o.length; i++) {
					var s = e, u = n, f = o[i], p = Xn();
					if (Be) {
						var g = u;
						e: for (; g !== null;) {
							switch (g.tag) {
								case 27: if (d) {
									if (j(g.type)) {
										_n = g.stateNode, nr = !1;
										break e;
									}
									break;
								}
								case 5:
									_n = g.stateNode, nr = !1;
									break e;
								case 3:
								case 4:
									_n = g.stateNode.containerInfo, nr = !0;
									break e;
							}
							g = g.return;
						}
						if (_n === null) throw Error("Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.");
						_f(s, u, f), _n = null, nr = !1;
					} else _f(s, u, f);
					(f.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && Ot(f, $, q, "Unmount"), mt(p), s = f, u = s.alternate, u !== null && (u.return = null), s.return = null;
				}
				if (n.subtreeFlags & 13886) for (n = n.child; n !== null;) oh(n, e), n = n.sibling;
			}
			function oh(e, n) {
				var o = Xn(), i = Dr(), s = dr(), u = fr(), f = e.alternate, p = e.flags;
				switch (e.tag) {
					case 0:
					case 11:
					case 14:
					case 15:
						An(n, e), Vn(e), p & 4 && (M(Wt | lo, e, e.return), ca(Wt | lo, e), xf(e, e.return, Rr | lo));
						break;
					case 1:
						An(n, e), Vn(e), p & 512 && (Tn || f === null || Vr(f, f.return)), p & 64 && Si && (p = e.updateQueue, p !== null && (f = p.callbacks, f !== null && (n = p.shared.hiddenCallbacks, p.shared.hiddenCallbacks = n === null ? f : n.concat(f))));
						break;
					case 26: if (Re) {
						var g = Vo;
						An(n, e), Vn(e), p & 512 && (Tn || f === null || Vr(f, f.return)), p & 4 && (p = f !== null ? f.memoizedState : null, n = e.memoizedState, f === null ? n === null ? e.stateNode === null ? e.stateNode = $h(g, e.type, e.memoizedProps, e) : gl(g, e.type, e.stateNode) : e.stateNode = Kc(g, n, e.memoizedProps) : p !== n ? (p === null ? f.stateNode !== null && nd(f.stateNode) : ed(p), n === null ? gl(g, e.type, e.stateNode) : Kc(g, n, e.memoizedProps)) : n === null && e.stateNode !== null && bc(e, e.memoizedProps, f.memoizedProps));
						break;
					}
					case 27: if (d) {
						An(n, e), Vn(e), p & 512 && (Tn || f === null || Vr(f, f.return)), f !== null && p & 4 && bc(e, e.memoizedProps, f.memoizedProps);
						break;
					}
					case 5:
						if (An(n, e), Vn(e), p & 512 && (Tn || f === null || Vr(f, f.return)), Be) {
							if (e.flags & 32) {
								n = e.stateNode;
								try {
									B(e, fl, n);
								} catch (Fe) {
									Se(e, e.return, Fe);
								}
							}
							p & 4 && e.stateNode != null && (n = e.memoizedProps, bc(e, n, f !== null ? f.memoizedProps : n)), p & 1024 && (Rg = !0, e.type !== "form" && console.error("Unexpected host component type. Expected a form. This is a bug in React."));
						} else Xr && e.alternate !== null && (e.alternate.stateNode = e.stateNode);
						break;
					case 6:
						if (An(n, e), Vn(e), p & 4 && Be) {
							if (e.stateNode === null) throw Error("This should have a text node initialized. This error is likely caused by a bug in React. Please file an issue.");
							p = e.memoizedProps, f = f !== null ? f.memoizedProps : p, n = e.stateNode;
							try {
								B(e, ne, n, f, p);
							} catch (Fe) {
								Se(e, e.return, Fe);
							}
						}
						break;
					case 3:
						if (g = jr(), Re) {
							r();
							var S = Vo;
							Vo = Sa(n.containerInfo), An(n, e), Vo = S;
						} else An(n, e);
						if (Vn(e), p & 4) {
							if (Be && qn && f !== null && f.memoizedState.isDehydrated) try {
								B(e, Uo, n.containerInfo);
							} catch (Fe) {
								Se(e, e.return, Fe);
							}
							if (Xr) {
								p = n.containerInfo, f = n.pendingChildren;
								try {
									B(e, Qc, p, f);
								} catch (Fe) {
									Se(e, e.return, Fe);
								}
							}
						}
						Rg && (Rg = !1, ah(e)), n.effectDuration += ql(g);
						break;
					case 4:
						Re ? (f = Vo, Vo = Sa(e.stateNode.containerInfo), An(n, e), Vn(e), Vo = f) : (An(n, e), Vn(e)), p & 4 && Xr && Sr(e.stateNode, e, e.stateNode.pendingChildren);
						break;
					case 12:
						p = jr(), An(n, e), Vn(e), e.stateNode.effectDuration += ji(p);
						break;
					case 31:
						An(n, e), Vn(e), p & 4 && (p = e.updateQueue, p !== null && (e.updateQueue = null, Yi(e, p)));
						break;
					case 13:
						An(n, e), Vn(e), e.child.flags & 8192 && e.memoizedState !== null != (f !== null && f.memoizedState !== null) && (xm = me()), p & 4 && (p = e.updateQueue, p !== null && (e.updateQueue = null, Yi(e, p)));
						break;
					case 22:
						g = e.memoizedState !== null;
						var T = f !== null && f.memoizedState !== null, _ = Si, I = Tn;
						if (Si = _ || g, Tn = I || T, An(n, e), Tn = I, Si = _, T && !g && !_ && !I && (e.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && _i(e, $, q), Vn(e), p & 8192 && (n = e.stateNode, n._visibility = g ? n._visibility & ~pp : n._visibility | pp, !g || f === null || T || Si || Tn || (qa(e), (e.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && Ot(e, $, q, "Disconnect")), Be)) {
							e: if (f = null, Be) for (n = e;;) {
								if (n.tag === 5 || Re && n.tag === 26) {
									if (f === null) {
										T = f = n;
										try {
											S = T.stateNode, g ? B(T, pl, S) : B(T, Os, T.stateNode, T.memoizedProps);
										} catch (Fe) {
											Se(T, T.return, Fe);
										}
									}
								} else if (n.tag === 6) {
									if (f === null) {
										T = n;
										try {
											var O = T.stateNode;
											g ? B(T, Jm, O) : B(T, Mh, O, T.memoizedProps);
										} catch (Fe) {
											Se(T, T.return, Fe);
										}
									}
								} else if (n.tag === 18) {
									if (f === null) {
										T = n;
										try {
											var K = T.stateNode;
											g ? B(T, $s, K) : B(T, xt, T.stateNode);
										} catch (Fe) {
											Se(T, T.return, Fe);
										}
									}
								} else if ((n.tag !== 22 && n.tag !== 23 || n.memoizedState === null || n === e) && n.child !== null) {
									n.child.return = n, n = n.child;
									continue;
								}
								if (n === e) break e;
								for (; n.sibling === null;) {
									if (n.return === null || n.return === e) break e;
									f === n && (f = null), n = n.return;
								}
								f === n && (f = null), n.sibling.return = n.return, n = n.sibling;
							}
						}
						p & 4 && (p = e.updateQueue, p !== null && (f = p.retryQueue, f !== null && (p.retryQueue = null, Yi(e, f))));
						break;
					case 19:
						An(n, e), Vn(e), p & 4 && (p = e.updateQueue, p !== null && (e.updateQueue = null, Yi(e, p)));
						break;
					case 30: break;
					case 21: break;
					default: An(n, e), Vn(e);
				}
				(e.mode & 2) !== Z && 0 <= $ && 0 <= q && ((cn || .05 < en) && Un(e, $, q, en, Je), e.alternate === null && e.return !== null && e.return.alternate !== null && .05 < q - $ && (nh(e.return.alternate, e.return) || Ot(e, $, q, "Mount"))), mt(o), cr(i), Je = s, cn = u;
			}
			function Vn(e) {
				var n = e.flags;
				if (n & 2) {
					try {
						B(e, $n, e);
					} catch (o) {
						Se(e, e.return, o);
					}
					e.flags &= -3;
				}
				n & 4096 && (e.flags &= -4097);
			}
			function ah(e) {
				if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
					var n = e;
					ah(n), n.tag === 5 && n.flags & 1024 && Bs(n.stateNode), e = e.sibling;
				}
			}
			function rt(e, n) {
				if (n.subtreeFlags & 8772) for (n = n.child; n !== null;) yn(e, n.alternate, n), n = n.sibling;
			}
			function da(e) {
				var n = Xn(), o = Dr(), i = dr(), s = fr();
				switch (e.tag) {
					case 0:
					case 11:
					case 14:
					case 15:
						xf(e, e.return, Rr), qa(e);
						break;
					case 1:
						Vr(e, e.return);
						var u = e.stateNode;
						typeof u.componentWillUnmount == "function" && Xp(e, e.return, u), qa(e);
						break;
					case 27: d && B(e, R, e.stateNode);
					case 26:
					case 5:
						Vr(e, e.return), qa(e);
						break;
					case 22:
						e.memoizedState === null && qa(e);
						break;
					case 30:
						qa(e);
						break;
					default: qa(e);
				}
				(e.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(e, $, q, en, Je), mt(n), cr(o), Je = i, cn = s;
			}
			function qa(e) {
				for (e = e.child; e !== null;) da(e), e = e.sibling;
			}
			function ih(e, n, o, i) {
				var s = Xn(), u = Dr(), f = dr(), p = fr(), g = o.flags;
				switch (o.tag) {
					case 0:
					case 11:
					case 15:
						Gr(e, o, i), Pf(o, Rr);
						break;
					case 1:
						if (Gr(e, o, i), n = o.stateNode, typeof n.componentDidMount == "function" && B(o, mg, o, n), n = o.updateQueue, n !== null) {
							e = o.stateNode;
							try {
								B(o, Yd, n, e);
							} catch (S) {
								Se(o, o.return, S);
							}
						}
						i && g & 64 && Cf(o), _s(o, o.return);
						break;
					case 27: d && Hn(o);
					case 26:
					case 5:
						Gr(e, o, i), i && n === null && g & 4 && Rs(o), _s(o, o.return);
						break;
					case 12:
						if (i && g & 4) {
							g = jr(), Gr(e, o, i), i = o.stateNode, i.effectDuration += ji(g);
							try {
								B(o, yc, o, n, wl, i.effectDuration);
							} catch (S) {
								Se(o, o.return, S);
							}
						} else Gr(e, o, i);
						break;
					case 31:
						Gr(e, o, i), i && g & 4 && th(e, o);
						break;
					case 13:
						Gr(e, o, i), i && g & 4 && rh(e, o);
						break;
					case 22:
						o.memoizedState === null && Gr(e, o, i), _s(o, o.return);
						break;
					case 30: break;
					default: Gr(e, o, i);
				}
				(o.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(o, $, q, en, Je), mt(s), cr(u), Je = f, cn = p;
			}
			function Gr(e, n, o) {
				for (o = o && (n.subtreeFlags & 8772) !== 0, n = n.child; n !== null;) ih(e, n.alternate, n, o), n = n.sibling;
			}
			function Ga(e, n) {
				var o = null;
				e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (o = e.memoizedState.cachePool.pool), e = null, n.memoizedState !== null && n.memoizedState.cachePool !== null && (e = n.memoizedState.cachePool.pool), e !== o && (e != null && Po(e), o != null && Da(o));
			}
			function Rf(e, n) {
				e = null, n.alternate !== null && (e = n.alternate.memoizedState.cache), n = n.memoizedState.cache, n !== e && (Po(n), e != null && Da(e));
			}
			function wr(e, n, o, i, s) {
				if (n.subtreeFlags & 10256 || n.actualDuration !== 0 && (n.alternate === null || n.alternate.child !== n.child)) for (n = n.child; n !== null;) {
					var u = n.sibling;
					lh(e, n, o, i, u !== null ? u.actualStartTime : s), n = u;
				}
			}
			function lh(e, n, o, i, s) {
				var u = Xn(), f = Dr(), p = dr(), g = fr(), S = yl, T = n.flags;
				switch (n.tag) {
					case 0:
					case 11:
					case 15:
						(n.mode & 2) !== Z && 0 < n.actualStartTime && n.flags & 1 && po(n, n.actualStartTime, s, Wn, o), wr(e, n, o, i, s), T & 2048 && Yp(n, Ut | lo);
						break;
					case 1:
						(n.mode & 2) !== Z && 0 < n.actualStartTime && ((n.flags & 128) !== 0 ? Ri(n, n.actualStartTime, s, []) : n.flags & 1 && po(n, n.actualStartTime, s, Wn, o)), wr(e, n, o, i, s);
						break;
					case 3:
						var _ = jr(), I = Wn;
						Wn = n.alternate !== null && n.alternate.memoizedState.isDehydrated && (n.flags & 256) === 0, wr(e, n, o, i, s), Wn = I, T & 2048 && (o = null, n.alternate !== null && (o = n.alternate.memoizedState.cache), i = n.memoizedState.cache, i !== o && (Po(i), o != null && Da(o))), e.passiveEffectDuration += ql(_);
						break;
					case 12:
						if (T & 2048) {
							T = jr(), wr(e, n, o, i, s), e = n.stateNode, e.passiveEffectDuration += ji(T);
							try {
								B(n, Kp, n, n.alternate, wl, e.passiveEffectDuration);
							} catch (O) {
								Se(n, n.return, O);
							}
						} else wr(e, n, o, i, s);
						break;
					case 31:
						T = Wn, _ = n.alternate !== null ? n.alternate.memoizedState : null, I = n.memoizedState, _ !== null && I === null ? (I = n.deletions, I !== null && 0 < I.length && I[0].tag === 18 ? (Wn = !1, _ = _.hydrationErrors, _ !== null && Ri(n, n.actualStartTime, s, _)) : Wn = !0) : Wn = !1, wr(e, n, o, i, s), Wn = T;
						break;
					case 13:
						T = Wn, _ = n.alternate !== null ? n.alternate.memoizedState : null, I = n.memoizedState, _ === null || _.dehydrated === null || I !== null && I.dehydrated !== null ? Wn = !1 : (I = n.deletions, I !== null && 0 < I.length && I[0].tag === 18 ? (Wn = !1, _ = _.hydrationErrors, _ !== null && Ri(n, n.actualStartTime, s, _)) : Wn = !0), wr(e, n, o, i, s), Wn = T;
						break;
					case 23: break;
					case 22:
						I = n.stateNode, _ = n.alternate, n.memoizedState !== null ? I._visibility & gi ? wr(e, n, o, i, s) : Es(e, n, o, i, s) : I._visibility & gi ? wr(e, n, o, i, s) : (I._visibility |= gi, Jr(e, n, o, i, (n.subtreeFlags & 10256) !== 0 || n.actualDuration !== 0 && (n.alternate === null || n.alternate.child !== n.child), s), (n.mode & 2) === Z || Wn || (e = n.actualStartTime, 0 <= e && .05 < s - e && _i(n, e, s), 0 <= $ && 0 <= q && .05 < q - $ && _i(n, $, q))), T & 2048 && Ga(_, n);
						break;
					case 24:
						wr(e, n, o, i, s), T & 2048 && Rf(n.alternate, n);
						break;
					default: wr(e, n, o, i, s);
				}
				(n.mode & 2) !== Z && ((e = !Wn && n.alternate === null && n.return !== null && n.return.alternate !== null) && (o = n.actualStartTime, 0 <= o && .05 < s - o && Ot(n, o, s, "Mount")), 0 <= $ && 0 <= q && ((cn || .05 < en) && Un(n, $, q, en, Je), e && .05 < q - $ && Ot(n, $, q, "Mount"))), mt(u), cr(f), Je = p, cn = g, yl = S;
			}
			function Jr(e, n, o, i, s, u) {
				for (s = s && ((n.subtreeFlags & 10256) !== 0 || n.actualDuration !== 0 && (n.alternate === null || n.alternate.child !== n.child)), n = n.child; n !== null;) {
					var f = n.sibling;
					sh(e, n, o, i, s, f !== null ? f.actualStartTime : u), n = f;
				}
			}
			function sh(e, n, o, i, s, u) {
				var f = Xn(), p = Dr(), g = dr(), S = fr(), T = yl;
				s && (n.mode & 2) !== Z && 0 < n.actualStartTime && n.flags & 1 && po(n, n.actualStartTime, u, Wn, o);
				var _ = n.flags;
				switch (n.tag) {
					case 0:
					case 11:
					case 15:
						Jr(e, n, o, i, s, u), Yp(n, Ut);
						break;
					case 23: break;
					case 22:
						var I = n.stateNode;
						n.memoizedState !== null ? I._visibility & gi ? Jr(e, n, o, i, s, u) : Es(e, n, o, i, u) : (I._visibility |= gi, Jr(e, n, o, i, s, u)), s && _ & 2048 && Ga(n.alternate, n);
						break;
					case 24:
						Jr(e, n, o, i, s, u), s && _ & 2048 && Rf(n.alternate, n);
						break;
					default: Jr(e, n, o, i, s, u);
				}
				(n.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(n, $, q, en, Je), mt(f), cr(p), Je = g, cn = S, yl = T;
			}
			function Es(e, n, o, i, s) {
				if (n.subtreeFlags & 10256 || n.actualDuration !== 0 && (n.alternate === null || n.alternate.child !== n.child)) for (var u = n.child; u !== null;) {
					n = u.sibling;
					var f = e, p = o, g = i, S = n !== null ? n.actualStartTime : s, T = yl;
					(u.mode & 2) !== Z && 0 < u.actualStartTime && u.flags & 1 && po(u, u.actualStartTime, S, Wn, p);
					var _ = u.flags;
					switch (u.tag) {
						case 22:
							Es(f, u, p, g, S), _ & 2048 && Ga(u.alternate, u);
							break;
						case 24:
							Es(f, u, p, g, S), _ & 2048 && Rf(u.alternate, u);
							break;
						default: Es(f, u, p, g, S);
					}
					yl = T, u = n;
				}
			}
			function Ja(e, n, o) {
				if (e.subtreeFlags & wd) for (e = e.child; e !== null;) uh(e, n, o), e = e.sibling;
			}
			function uh(e, n, o) {
				switch (e.tag) {
					case 26:
						if (Ja(e, n, o), e.flags & wd) if (e.memoizedState !== null) c(o, Vo, e.memoizedState, e.memoizedProps);
						else {
							var i = e.stateNode, s = e.type;
							e = e.memoizedProps, ((n & 335544128) === n || Hc(s, e)) && Ac(o, i, s, e);
						}
						break;
					case 5:
						Ja(e, n, o), e.flags & wd && (i = e.stateNode, s = e.type, e = e.memoizedProps, ((n & 335544128) === n || Hc(s, e)) && Ac(o, i, s, e));
						break;
					case 3:
					case 4:
						Re ? (i = Vo, Vo = Sa(e.stateNode.containerInfo), Ja(e, n, o), Vo = i) : Ja(e, n, o);
						break;
					case 22:
						e.memoizedState === null && (i = e.alternate, i !== null && i.memoizedState !== null ? (i = wd, wd = 16777216, Ja(e, n, o), wd = i) : Ja(e, n, o));
						break;
					default: Ja(e, n, o);
				}
			}
			function ch(e) {
				var n = e.alternate;
				if (n !== null && (e = n.child, e !== null)) {
					n.child = null;
					do
						n = e.sibling, e.sibling = null, e = n;
					while (e !== null);
				}
			}
			function Is(e) {
				var n = e.deletions;
				if ((e.flags & 16) !== 0) {
					if (n !== null) for (var o = 0; o < n.length; o++) {
						var i = n[o], s = Xn();
						Gn = i, ph(i, e), (i.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && Ot(i, $, q, "Unmount"), mt(s);
					}
					ch(e);
				}
				if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) dh(e), e = e.sibling;
			}
			function dh(e) {
				var n = Xn(), o = Dr(), i = dr(), s = fr();
				switch (e.tag) {
					case 0:
					case 11:
					case 15:
						Is(e), e.flags & 2048 && zf(e, e.return, Ut | lo);
						break;
					case 3:
						var u = jr();
						Is(e), e.stateNode.passiveEffectDuration += ql(u);
						break;
					case 12:
						u = jr(), Is(e), e.stateNode.passiveEffectDuration += ji(u);
						break;
					case 22:
						u = e.stateNode, e.memoizedState !== null && u._visibility & gi && (e.return === null || e.return.tag !== 13) ? (u._visibility &= ~gi, vc(e), (e.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && Ot(e, $, q, "Disconnect")) : Is(e);
						break;
					default: Is(e);
				}
				(e.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(e, $, q, en, Je), mt(n), cr(o), cn = s, Je = i;
			}
			function vc(e) {
				var n = e.deletions;
				if ((e.flags & 16) !== 0) {
					if (n !== null) for (var o = 0; o < n.length; o++) {
						var i = n[o], s = Xn();
						Gn = i, ph(i, e), (i.mode & 2) !== Z && 0 <= $ && 0 <= q && .05 < q - $ && Ot(i, $, q, "Unmount"), mt(s);
					}
					ch(e);
				}
				for (e = e.child; e !== null;) fh(e), e = e.sibling;
			}
			function fh(e) {
				var n = Xn(), o = Dr(), i = dr(), s = fr();
				switch (e.tag) {
					case 0:
					case 11:
					case 15:
						zf(e, e.return, Ut), vc(e);
						break;
					case 22:
						var u = e.stateNode;
						u._visibility & gi && (u._visibility &= ~gi, vc(e));
						break;
					default: vc(e);
				}
				(e.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(e, $, q, en, Je), mt(n), cr(o), cn = s, Je = i;
			}
			function ph(e, n) {
				for (; Gn !== null;) {
					var o = Gn, i = o, s = n, u = Xn(), f = Dr(), p = dr(), g = fr();
					switch (i.tag) {
						case 0:
						case 11:
						case 15:
							zf(i, s, Ut);
							break;
						case 23:
						case 22:
							i.memoizedState !== null && i.memoizedState.cachePool !== null && (s = i.memoizedState.cachePool.pool, s != null && Po(s));
							break;
						case 24: Da(i.memoizedState.cache);
					}
					if ((i.mode & 2) !== Z && 0 <= $ && 0 <= q && (cn || .05 < en) && Un(i, $, q, en, Je), mt(u), cr(f), cn = g, Je = p, i = o.child, i !== null) i.return = o, Gn = i;
					else e: for (o = e; Gn !== null;) {
						if (i = Gn, u = i.sibling, f = i.return, qr(i), i === o) {
							Gn = null;
							break e;
						}
						if (u !== null) {
							u.return = f, Gn = u;
							break e;
						}
						Gn = f;
					}
				}
			}
			function Ef(e) {
				var n = Gm(e);
				if (n != null) {
					if (typeof n.memoizedProps["data-testname"] != "string") throw Error("Invalid host root specified. Should be either a React container or a node with a testname attribute.");
					return n;
				}
				if (e = $f(e), e === null) throw Error("Could not find React container within specified host subtree.");
				return e.stateNode.current;
			}
			function If(e, n) {
				var o = e.tag;
				switch (n.$$typeof) {
					case pm:
						if (e.type === n.value) return !0;
						break;
					case hm:
						e: {
							for (n = n.value, e = [e, 0], o = 0; o < e.length;) {
								var i = e[o++], s = i.tag, u = e[o++], f = n[u];
								if (s !== 5 && s !== 26 && s !== 27 || !Kr(i)) {
									for (; f != null && If(i, f);) u++, f = n[u];
									if (u === n.length) {
										n = !0;
										break e;
									} else for (i = i.child; i !== null;) e.push(i, u), i = i.sibling;
								}
							}
							n = !1;
						}
						return n;
					case mm:
						if ((o === 5 || o === 26 || o === 27) && Wc(e.stateNode, n.value)) return !0;
						break;
					case ym:
						if ((o === 5 || o === 6 || o === 26 || o === 27) && (e = Vf(e), e !== null && 0 <= e.indexOf(n.value))) return !0;
						break;
					case gm:
						if ((o === 5 || o === 26 || o === 27) && (e = e.memoizedProps["data-testname"], typeof e == "string" && e.toLowerCase() === n.value.toLowerCase())) return !0;
						break;
					default: throw Error("Invalid selector type specified.");
				}
				return !1;
			}
			function Sc(e) {
				switch (e.$$typeof) {
					case pm: return "<" + ($e(e.value) || "Unknown") + ">";
					case hm: return ":has(" + (Sc(e) || "") + ")";
					case mm: return "[role=\"" + e.value + "\"]";
					case ym: return "\"" + e.value + "\"";
					case gm: return "[data-testname=\"" + e.value + "\"]";
					default: throw Error("Invalid selector type specified.");
				}
			}
			function hh(e, n) {
				var o = [];
				e = [e, 0];
				for (var i = 0; i < e.length;) {
					var s = e[i++], u = s.tag, f = e[i++], p = n[f];
					if (u !== 5 && u !== 26 && u !== 27 || !Kr(s)) {
						for (; p != null && If(s, p);) f++, p = n[f];
						if (f === n.length) o.push(s);
						else for (s = s.child; s !== null;) e.push(s, f), s = s.sibling;
					}
				}
				return o;
			}
			function kc(e, n) {
				if (!xr) throw Error("Test selector API is not supported by this renderer.");
				e = Ef(e), e = hh(e, n), n = [], e = Array.from(e);
				for (var o = 0; o < e.length;) {
					var i = e[o++], s = i.tag;
					if (s === 5 || s === 26 || s === 27) Kr(i) || n.push(i.stateNode);
					else for (i = i.child; i !== null;) e.push(i), i = i.sibling;
				}
				return n;
			}
			function Wm() {
				xr && bm.forEach(function(e) {
					return e();
				});
			}
			function mh() {
				var e = typeof IS_REACT_ACT_ENVIRONMENT < "u" ? IS_REACT_ACT_ENVIRONMENT : void 0;
				return e || x.actQueue === null || console.error("The current testing environment is not configured to support act(...)"), e;
			}
			function Nt(e) {
				if ((ye & Zn) !== Jn && ae !== 0) return ae & -ae;
				var n = x.T;
				return n !== null ? (n._updatedFibers || (n._updatedFibers = /* @__PURE__ */ new Set()), n._updatedFibers.add(e), Ru()) : Mf();
			}
			function gh() {
				if (rr === 0) if ((ae & 536870912) === 0 || ge) {
					var e = C;
					C <<= 1, !(C & 3932160) && (C = 262144), rr = e;
				} else rr = 536870912;
				return e = _r.current, e !== null && (e.flags |= 32), rr;
			}
			function We(e, n, o) {
				if (zd && console.error("useInsertionEffect must not schedule updates."), Bg && (Tm = !0), (e === je && (Le === lu || Le === su) || e.cancelPendingCommit !== null) && (Xi(e, 0), No(e, ae, rr, !1)), Ci(e, o), (ye & Zn) !== Jn && e === je) {
					if (Pa) switch (n.tag) {
						case 0:
						case 11:
						case 15:
							e = se && G(se) || "Unknown", fb.has(e) || (fb.add(e), n = G(n) || "Unknown", console.error("Cannot update a component (`%s`) while rendering a different component (`%s`). To locate the bad setState() call inside `%s`, follow the stack trace as described in https://react.dev/link/setstate-in-render", n, e, e));
							break;
						case 1: db || (console.error("Cannot update during an existing state transition (such as within `render`). Render methods should be a pure function of props and state."), db = !0);
					}
				} else wa && yu(e, n, o), Hh(n), e === je && ((ye & Zn) === Jn && (El |= o), nn === Tl && No(e, ae, rr, !1)), Kn(e);
			}
			function Lf(e, n, o) {
				if ((ye & (Zn | uo)) !== Jn) throw Error("Should not already be working.");
				if (ae !== 0 && se !== null) {
					var i = se, s = me();
					switch (ay) {
						case Sp:
						case lu:
							var u = rp;
							Me && ((i = i._debugTask) ? i.run(console.timeStamp.bind(console, "Suspended", u, s, "Components ⚛", void 0, "primary-light")) : console.timeStamp("Suspended", u, s, "Components ⚛", void 0, "primary-light"));
							break;
						case su:
							u = rp, Me && ((i = i._debugTask) ? i.run(console.timeStamp.bind(console, "Action", u, s, "Components ⚛", void 0, "primary-light")) : console.timeStamp("Action", u, s, "Components ⚛", void 0, "primary-light"));
							break;
						default: Me && (i = s - rp, 3 > i || console.timeStamp("Blocked", rp, s, "Components ⚛", void 0, 5 > i ? "primary-light" : 10 > i ? "primary" : 100 > i ? "primary-dark" : "error"));
					}
				}
				u = (o = !o && (n & 127) === 0 && (n & e.expiredLanes) === 0 || Hl(e, n)) ? Um(e, n) : Ff(e, n, !0);
				var f = o;
				do {
					if (u === ki) {
						Pd && !o && No(e, n, 0, !1), n = Le, rp = xn(), ay = n;
						break;
					} else {
						if (i = me(), s = e.current.alternate, f && !bh(s)) {
							En(n), s = Ct, u = i, !Me || u <= s || (gn ? gn.run(console.timeStamp.bind(console, "Teared Render", s, u, fe, "Scheduler ⚛", "error")) : console.timeStamp("Teared Render", s, u, fe, "Scheduler ⚛", "error")), Za(n, i), u = Ff(e, n, !1), f = !1;
							continue;
						}
						if (u === iu) {
							if (f = n, e.errorRecoveryDisabledLanes & f) var p = 0;
							else p = e.pendingLanes & -536870913, p = p !== 0 ? p : p & 536870912 ? 536870912 : 0;
							if (p !== 0) {
								En(n), Ra(Ct, i, n, gn), Za(n, i), n = p;
								e: {
									i = e, u = f, f = wp;
									var g = qn && i.current.memoizedState.isDehydrated;
									if (g && (Xi(i, p).flags |= 256), p = Ff(i, p, !1), p !== iu) {
										if (Lg && !g) {
											i.errorRecoveryDisabledLanes |= u, El |= u, u = Tl;
											break e;
										}
										i = Bt, Bt = f, i !== null && (Bt === null ? Bt = i : Bt.push.apply(Bt, i));
									}
									u = p;
								}
								if (f = !1, u !== iu) continue;
								i = me();
							}
						}
						if (u === vp) {
							En(n), Ra(Ct, i, n, gn), Za(n, i), Xi(e, 0), No(e, n, 0, !0);
							break;
						}
						e: {
							switch (o = e, u) {
								case ki:
								case vp: throw Error("Root did not complete. This is a bug in React.");
								case Tl: if ((n & 4194048) !== n) break;
								case Sm:
									En(n), Wl(Ct, i, n, gn), Za(n, i), s = n, (s & 127) !== 0 ? Xh = i : s & 4194048 && (Kh = i), No(o, n, rr, !_l);
									break e;
								case iu:
									Bt = null;
									break;
								case vm:
								case Ky: break;
								default: throw Error("Unknown root exit status.");
							}
							if (x.actQueue !== null) Hf(o, s, n, Bt, xp, Pm, rr, El, uu, u, null, null, Ct, i);
							else {
								if ((n & 62914560) === n && (f = xm + tb - me(), 10 < f)) {
									if (No(o, n, rr, !_l), zi(o, 0, !0) !== 0) break e;
									qo = n, o.timeoutHandle = Yt(yh.bind(null, o, s, Bt, xp, Pm, n, rr, El, uu, _l, u, "Throttled", Ct, i), f);
									break e;
								}
								yh(o, s, Bt, xp, Pm, n, rr, El, uu, _l, u, null, Ct, i);
							}
						}
					}
					break;
				} while (!0);
				Kn(e);
			}
			function yh(e, n, o, i, s, u, f, p, g, S, T, _, I, O) {
				e.timeoutHandle = Yr;
				var K = n.subtreeFlags, Fe = null;
				if ((K & 8192 || (K & 16785408) === 16785408) && (Fe = cl(), uh(n, u, Fe), K = (u & 62914560) === u ? xm - me() : (u & 4194048) === u ? nb - me() : 0, K = jc(Fe, K), K !== null)) {
					qo = u, e.cancelPendingCommit = K(Hf.bind(null, e, n, u, o, i, s, f, p, g, T, Fe, Dc(Fe, e.containerInfo), I, O)), No(e, u, f, !S);
					return;
				}
				Hf(e, n, u, o, i, s, f, p, g, T, Fe, _, I, O);
			}
			function bh(e) {
				for (var n = e;;) {
					var o = n.tag;
					if ((o === 0 || o === 11 || o === 15) && n.flags & 16384 && (o = n.updateQueue, o !== null && (o = o.stores, o !== null))) for (var i = 0; i < o.length; i++) {
						var s = o[i], u = s.getSnapshot;
						s = s.value;
						try {
							if (!jt(u(), s)) return !1;
						} catch {
							return !1;
						}
					}
					if (o = n.child, n.subtreeFlags & 16384 && o !== null) o.return = n, n = o;
					else {
						if (n === e) break;
						for (; n.sibling === null;) {
							if (n.return === null || n.return === e) return !0;
							n = n.return;
						}
						n.sibling.return = n.return, n = n.sibling;
					}
				}
				return !0;
			}
			function No(e, n, o, i) {
				n &= ~Ng, n &= ~El, e.suspendedLanes |= n, e.pingedLanes &= ~n, i && (e.warmLanes |= n), i = e.expirationTimes;
				for (var s = n; 0 < s;) {
					var u = 31 - vn(s), f = 1 << u;
					i[u] = -1, s &= ~f;
				}
				o !== 0 && gu(e, o, n);
			}
			function Ls() {
				return (ye & (Zn | uo)) === Jn ? (Wa(0, !1), !1) : !0;
			}
			function Ns() {
				return (ye & (Zn | uo)) !== Jn;
			}
			function Fs() {
				if (se !== null) {
					if (Le === tr) var e = se.return;
					else e = se, zu(), ds(e), fd = null, fp = 0, e = se;
					for (; e !== null;) gc(e.alternate, e), e = e.return;
					se = null;
				}
			}
			function Za(e, n) {
				e & 127 && (Zs = n), e & 4194048 && (hi = n);
			}
			function Xi(e, n) {
				Me && (console.timeStamp("Blocking Track", .003, .003, "Blocking", "Scheduler ⚛", "primary-light"), console.timeStamp("Transition Track", .003, .003, "Transition", "Scheduler ⚛", "primary-light"), console.timeStamp("Suspense Track", .003, .003, "Suspense", "Scheduler ⚛", "primary-light"), console.timeStamp("Idle Track", .003, .003, "Idle", "Scheduler ⚛", "primary-light"));
				var o = Ct;
				if (Ct = xn(), ae !== 0 && 0 < o) {
					if (En(ae), nn === vm || nn === Tl) Wl(o, Ct, n, gn);
					else {
						var i = Ct, s = gn;
						if (Me && !(i <= o)) {
							var u = (n & 738197653) === n ? "tertiary-dark" : "primary-dark", f = (n & 536870912) === n ? "Prewarm" : (n & 201326741) === n ? "Interrupted Hydration" : "Interrupted Render";
							s ? s.run(console.timeStamp.bind(console, f, o, i, fe, "Scheduler ⚛", u)) : console.timeStamp(f, o, i, fe, "Scheduler ⚛", u);
						}
					}
					Za(ae, Ct);
				}
				if (o = gn, gn = null, (n & 127) !== 0) {
					gn = ep, s = 0 <= za && za < Zs ? Zs : za, i = 0 <= Ys && Ys < Zs ? Zs : Ys, u = 0 <= i ? i : 0 <= s ? s : Ct, 0 <= Xh && (En(2), Nd(Xh, u, n, o)), o = s;
					var p = i, g = np, S = 0 < ld, T = Pl === 1, _ = Pl === 2;
					if (s = Ct, i = ep, u = ig, f = lg, Me) {
						if (fe = "Blocking", 0 < o ? o > s && (o = s) : o = s, 0 < p ? p > o && (p = o) : p = o, g !== null && o > p) {
							var I = S ? "secondary-light" : "warning";
							i ? i.run(console.timeStamp.bind(console, S ? "Consecutive" : "Event: " + g, p, o, fe, "Scheduler ⚛", I)) : console.timeStamp(S ? "Consecutive" : "Event: " + g, p, o, fe, "Scheduler ⚛", I);
						}
						s > o && (p = T ? "error" : (n & 738197653) === n ? "tertiary-light" : "primary-light", T = _ ? "Promise Resolved" : T ? "Cascading Update" : 5 < s - o ? "Update Blocked" : "Update", _ = [], f != null && _.push(["Component name", f]), u != null && _.push(["Method name", u]), o = {
							start: o,
							end: s,
							detail: { devtools: {
								properties: _,
								track: fe,
								trackGroup: "Scheduler ⚛",
								color: p
							} }
						}, i ? i.run(performance.measure.bind(performance, T, o)) : performance.measure(T, o));
					}
					za = -1.1, Pl = 0, lg = ig = null, Xh = -1.1, ld = Ys, Ys = -1.1, Zs = xn();
				}
				if (n & 4194048 && (gn = tp, s = 0 <= mi && mi < hi ? hi : mi, o = 0 <= ao && ao < hi ? hi : ao, i = 0 <= xl && xl < hi ? hi : xl, u = 0 <= i ? i : 0 <= o ? o : Ct, 0 <= Kh && (En(256), Nd(Kh, u, n, gn)), _ = i, p = Xs, g = 0 < zl, S = sg === 2, u = Ct, i = tp, f = ry, T = oy, Me && (fe = "Transition", 0 < o ? o > u && (o = u) : o = u, 0 < s ? s > o && (s = o) : s = o, 0 < _ ? _ > s && (_ = s) : _ = s, s > _ && p !== null && (I = g ? "secondary-light" : "warning", i ? i.run(console.timeStamp.bind(console, g ? "Consecutive" : "Event: " + p, _, s, fe, "Scheduler ⚛", I)) : console.timeStamp(g ? "Consecutive" : "Event: " + p, _, s, fe, "Scheduler ⚛", I)), o > s && (i ? i.run(console.timeStamp.bind(console, "Action", s, o, fe, "Scheduler ⚛", "primary-dark")) : console.timeStamp("Action", s, o, fe, "Scheduler ⚛", "primary-dark")), u > o && (s = S ? "Promise Resolved" : 5 < u - o ? "Update Blocked" : "Update", _ = [], T != null && _.push(["Component name", T]), f != null && _.push(["Method name", f]), o = {
					start: o,
					end: u,
					detail: { devtools: {
						properties: _,
						track: fe,
						trackGroup: "Scheduler ⚛",
						color: "primary-light"
					} }
				}, i ? i.run(performance.measure.bind(performance, s, o)) : performance.measure(s, o))), ao = mi = -1.1, sg = 0, Kh = -1.1, zl = xl, xl = -1.1, hi = xn()), o = e.timeoutHandle, o !== Yr && (e.timeoutHandle = Yr, Of(o)), o = e.cancelPendingCommit, o !== null && (e.cancelPendingCommit = null, o()), qo = 0, Fs(), je = e, se = o = Fo(e.current, null), ae = n, Le = tr, Er = null, _l = !1, Pd = Hl(e, n), Lg = !1, nn = ki, uu = rr = Ng = El = Rl = 0, Bt = wp = null, Pm = !1, n & 8 && (n |= n & 32), i = e.entangledLanes, i !== 0) for (e = e.entanglements, i &= n; 0 < i;) s = 31 - vn(i), u = 1 << s, n |= e[s], i &= ~u;
				return Ta = n, Ui(), e = Vg(), 1e3 < e - $g && (x.recentlyCreatedOwnerStacks = 0, $g = e), Mo.discardPendingWarnings(), o;
			}
			function vh(e, n) {
				Y = null, x.H = yp, x.getCurrentStack = null, Pa = !1, di = null, n === dd || n === am ? (n = qd(), Le = Sp) : n === gg ? (n = qd(), Le = eb) : Le = n === Tg ? Ig : n !== null && typeof n == "object" && typeof n.then == "function" ? kp : km, Er = n;
				var o = se;
				o === null ? (nn = vp, vs(e, ft(n, e.current))) : o.mode & 2 && Cu(o);
			}
			function Sh() {
				var e = _r.current;
				return e === null ? !0 : (ae & 4194048) === ae ? Qo === null : (ae & 62914560) === ae || (ae & 536870912) !== 0 ? e === Qo : !1;
			}
			function Nf() {
				var e = x.H;
				return x.H = yp, e === null ? yp : e;
			}
			function kh() {
				var e = x.A;
				return x.A = Vb, e;
			}
			function wc(e) {
				gn === null && (gn = e._debugTask == null ? null : e._debugTask);
			}
			function Pc() {
				nn = Tl, _l || (ae & 4194048) !== ae && _r.current !== null || (Pd = !0), !(Rl & 134217727) && !(El & 134217727) || je === null || No(je, ae, rr, !1);
			}
			function Ff(e, n, o) {
				var i = ye;
				ye |= Zn;
				var s = Nf(), u = kh();
				if (je !== e || ae !== n) {
					if (wa) {
						var f = e.memoizedUpdaters;
						0 < f.size && (nl(e, ae), f.clear()), jl(e, n);
					}
					xp = null, Xi(e, n);
				}
				n = !1, f = nn;
				e: do
					try {
						if (Le !== tr && se !== null) {
							var p = se, g = Er;
							switch (Le) {
								case Ig:
									Fs(), f = Sm;
									break e;
								case Sp:
								case lu:
								case su:
								case kp:
									_r.current === null && (n = !0);
									var S = Le;
									if (Le = tr, Er = null, Ki(e, p, g, S), o && Pd) {
										f = ki;
										break e;
									}
									break;
								default: S = Le, Le = tr, Er = null, Ki(e, p, g, S);
							}
						}
						wh(), f = nn;
						break;
					} catch (T) {
						vh(e, T);
					}
				while (!0);
				return n && e.shellSuspendCounter++, zu(), ye = i, x.H = s, x.A = u, se === null && (je = null, ae = 0, Ui()), f;
			}
			function wh() {
				for (; se !== null;) Ph(se);
			}
			function Um(e, n) {
				var o = ye;
				ye |= Zn;
				var i = Nf(), s = kh();
				if (je !== e || ae !== n) {
					if (wa) {
						var u = e.memoizedUpdaters;
						0 < u.size && (nl(e, ae), u.clear()), jl(e, n);
					}
					xp = null, Pp = me() + Fg, Xi(e, n);
				} else Pd = Hl(e, n);
				e: do
					try {
						if (Le !== tr && se !== null) n: switch (n = se, u = Er, Le) {
							case km:
								Le = tr, Er = null, Ki(e, n, u, km);
								break;
							case lu:
							case su:
								if (Vd(u)) {
									Le = tr, Er = null, xh(n);
									break;
								}
								n = function() {
									Le !== lu && Le !== su || je !== e || (Le = wm), Kn(e);
								}, u.then(n, n);
								break e;
							case Sp:
								Le = wm;
								break e;
							case eb:
								Le = Eg;
								break e;
							case wm:
								Vd(u) ? (Le = tr, Er = null, xh(n)) : (Le = tr, Er = null, Ki(e, n, u, wm));
								break;
							case Eg:
								var f = null;
								switch (se.tag) {
									case 26: f = se.memoizedState;
									case 5:
									case 27:
										var p = se, g = p.type, S = p.pendingProps;
										if (f ? l(f) : ha(p.stateNode, g, S)) {
											Le = tr, Er = null;
											var T = p.sibling;
											if (T !== null) se = T;
											else {
												var _ = p.return;
												_ !== null ? (se = _, xc(_)) : se = null;
											}
											break n;
										}
										break;
									default: console.error("Unexpected type of fiber triggered a suspensey commit. This is a bug in React.");
								}
								Le = tr, Er = null, Ki(e, n, u, Eg);
								break;
							case kp:
								Le = tr, Er = null, Ki(e, n, u, kp);
								break;
							case Ig:
								Fs(), nn = Sm;
								break e;
							default: throw Error("Unexpected SuspendedReason. This is a bug in React.");
						}
						x.actQueue !== null ? wh() : Bm();
						break;
					} catch (I) {
						vh(e, I);
					}
				while (!0);
				return zu(), x.H = i, x.A = s, ye = o, se !== null ? ki : (je = null, ae = 0, Ui(), nn);
			}
			function Bm() {
				for (; se !== null && !J();) Ph(se);
			}
			function Ph(e) {
				var n = e.alternate;
				(e.mode & 2) !== Z ? (Jl(e), n = B(e, tt, n, e, Ta), Cu(e)) : n = B(e, tt, n, e, Ta), e.memoizedProps = e.pendingProps, n === null ? xc(e) : se = n;
			}
			function xh(e) {
				var n = B(e, Om, e);
				e.memoizedProps = e.pendingProps, n === null ? xc(e) : se = n;
			}
			function Om(e) {
				var n = e.alternate, o = (e.mode & 2) !== Z;
				switch (o && Jl(e), e.tag) {
					case 15:
					case 0:
						n = Qr(n, e, e.pendingProps, e.type, void 0, ae);
						break;
					case 11:
						n = Qr(n, e, e.pendingProps, e.type.render, e.ref, ae);
						break;
					case 5: ds(e);
					default: gc(n, e), e = se = dn(e, Ta), n = tt(n, e, Ta);
				}
				return o && Cu(e), n;
			}
			function Ki(e, n, o, i) {
				zu(), ds(n), fd = null, fp = 0;
				var s = n.return;
				try {
					if (Jp(e, s, n, o, ae)) {
						nn = vp, vs(e, ft(o, e.current)), se = null;
						return;
					}
				} catch (u) {
					if (s !== null) throw se = s, u;
					nn = vp, vs(e, ft(o, e.current)), se = null;
					return;
				}
				n.flags & 32768 ? (ge || i === km ? e = !0 : Pd || (ae & 536870912) !== 0 ? e = !1 : (_l = e = !0, (i === lu || i === su || i === Sp || i === kp) && (i = _r.current, i !== null && i.tag === 13 && (i.flags |= 16384))), zh(n, e)) : xc(n);
			}
			function xc(e) {
				var n = e;
				do {
					if ((n.flags & 32768) !== 0) {
						zh(n, _l);
						return;
					}
					var o = n.alternate;
					if (e = n.return, Jl(n), o = B(n, wf, o, n, Ta), (n.mode & 2) !== Z && Wd(n), o !== null) {
						se = o;
						return;
					}
					if (n = n.sibling, n !== null) {
						se = n;
						return;
					}
					se = n = e;
				} while (n !== null);
				nn === ki && (nn = Ky);
			}
			function zh(e, n) {
				do {
					var o = ua(e.alternate, e);
					if (o !== null) {
						o.flags &= 32767, se = o;
						return;
					}
					if ((e.mode & 2) !== Z) {
						Wd(e), o = e.actualDuration;
						for (var i = e.child; i !== null;) o += i.actualDuration, i = i.sibling;
						e.actualDuration = o;
					}
					if (o = e.return, o !== null && (o.flags |= 32768, o.subtreeFlags = 0, o.deletions = null), !n && (e = e.sibling, e !== null)) {
						se = e;
						return;
					}
					se = e = o;
				} while (e !== null);
				nn = Sm, se = null;
			}
			function Hf(e, n, o, i, s, u, f, p, g, S, T, _, I, O) {
				e.cancelPendingCommit = null;
				do
					el();
				while (Rn !== Ll);
				if (Mo.flushLegacyContextWarning(), Mo.flushPendingUnsafeLifecycleWarnings(), (ye & (Zn | uo)) !== Jn) throw Error("Should not already be working.");
				if (En(o), S === iu ? Ra(I, O, o, gn) : i !== null ? Fd(I, O, o, i, n !== null && n.alternate !== null && n.alternate.memoizedState.isDehydrated && (n.flags & 256) !== 0, gn) : In(I, O, o, gn), n !== null) {
					if (o === 0 && console.error("finishedLanes should not be empty during a commit. This is a bug in React."), n === e.current) throw Error("Cannot commit the same tree as before. This error is likely caused by a bug in React. Please file an issue.");
					if (u = n.lanes | n.childLanes, u |= bg, Id(e, o, u, f, p, g), e === je && (se = je = null, ae = 0), xd = n, Nl = e, qo = o, jg = u, Wg = s, sb = i, Dg = O, ub = _, Go = zm, cb = null, n.actualDuration !== 0 || (n.subtreeFlags & 10256) !== 0 || (n.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, Fh(qs, function() {
						return ll(), Go === zm && (Go = Ag), Eh(), null;
					})) : (e.callbackNode = null, e.callbackPriority = 0), pi = null, wl = xn(), _ !== null && bu(O, wl, _, gn), i = (n.flags & 13878) !== 0, (n.subtreeFlags & 13878) !== 0 || i) {
						i = x.T, x.T = null, s = wt(), an(2), f = ye, ye |= uo;
						try {
							jm(e, n, o);
						} finally {
							ye = f, an(s), x.T = i;
						}
					}
					Rn = ob, Ch(), Th(), _h();
				}
			}
			function Ch() {
				if (Rn === ob) {
					Rn = Ll;
					var e = Nl, n = xd, o = qo, i = (n.flags & 13878) !== 0;
					if ((n.subtreeFlags & 13878) !== 0 || i) {
						i = x.T, x.T = null;
						var s = wt();
						an(2);
						var u = ye;
						ye |= uo;
						try {
							Sd = o, kd = e, Gl(), oh(n, e), kd = Sd = null, pa(e.containerInfo);
						} finally {
							ye = u, an(s), x.T = i;
						}
					}
					e.current = n, Rn = ab;
				}
			}
			function Th() {
				if (Rn === ab) {
					Rn = Ll;
					var e = cb;
					if (e !== null) {
						wl = xn();
						var n = fi, o = wl;
						!Me || o <= n || console.timeStamp(e, n, o, fe, "Scheduler ⚛", "secondary-light");
					}
					e = Nl, n = xd, o = qo;
					var i = (n.flags & 8772) !== 0;
					if ((n.subtreeFlags & 8772) !== 0 || i) {
						i = x.T, x.T = null;
						var s = wt();
						an(2);
						var u = ye;
						ye |= uo;
						try {
							Sd = o, kd = e, Gl(), yn(e, n.alternate, n), kd = Sd = null;
						} finally {
							ye = u, an(s), x.T = i;
						}
					}
					e = Dg, n = ub, fi = xn(), e = n === null ? e : wl, n = fi, o = Go === Hg, i = gn, pi !== null ? ir(e, n, pi, !1, i) : !Me || n <= e || (i ? i.run(console.timeStamp.bind(console, o ? "Commit Interrupted View Transition" : "Commit", e, n, fe, "Scheduler ⚛", o ? "error" : "secondary-dark")) : console.timeStamp(o ? "Commit Interrupted View Transition" : "Commit", e, n, fe, "Scheduler ⚛", o ? "error" : "secondary-dark")), Rn = ib;
				}
			}
			function _h() {
				if (Rn === lb || Rn === ib) {
					if (Rn === lb) {
						var e = fi;
						fi = xn();
						var n = fi, o = Go === Hg;
						!Me || n <= e || console.timeStamp(o ? "Interrupted View Transition" : "Starting Animation", e, n, fe, "Scheduler ⚛", o ? " error" : "secondary-light"), Go !== Hg && (Go = rb);
					}
					Rn = Ll, Pe(), e = Nl;
					var i = xd;
					n = qo, o = sb;
					var s = i.actualDuration !== 0 || (i.subtreeFlags & 10256) !== 0 || (i.flags & 10256) !== 0;
					s ? Rn = Cm : (Rn = Ll, xd = Nl = null, Rh(e, e.pendingLanes), cu = 0, Cp = null);
					var u = e.pendingLanes;
					if (u === 0 && (Il = null), s || Df(e), u = ar(n), i = i.stateNode, zt && typeof zt.onCommitFiberRoot == "function") try {
						var f = (i.current.flags & 128) === 128;
						switch (u) {
							case 2:
								var p = be;
								break;
							case 8:
								p = Oo;
								break;
							case 32:
								p = qs;
								break;
							case 268435456:
								p = Qg;
								break;
							default: p = qs;
						}
						zt.onCommitFiberRoot(td, i, p, f);
					} catch (_) {
						ka || (ka = !0, console.error("React instrumentation encountered an error: %o", _));
					}
					if (wa && e.memoizedUpdaters.clear(), Wm(), o !== null) {
						f = x.T, p = wt(), an(2), x.T = null;
						try {
							var g = e.onRecoverableError;
							for (i = 0; i < o.length; i++) {
								var S = o[i], T = Mm(S.stack);
								B(S.source, g, S.value, T);
							}
						} finally {
							x.T = f, an(p);
						}
					}
					qo & 3 && el(), Kn(e), u = e.pendingLanes, (n & 261930) !== 0 && (u & 42) !== 0 ? (nm = !0, e === Ug ? zp++ : (zp = 0, Ug = e)) : zp = 0, s || Za(n, fi), qn && Jf(), Wa(0, !1);
				}
			}
			function Mm(e) {
				return e = { componentStack: e }, Object.defineProperty(e, "digest", { get: function() {
					console.error("You are accessing \"digest\" from the errorInfo object passed to onRecoverableError. This property is no longer provided as part of errorInfo but can be accessed as a property of the Error instance itself.");
				} }), e;
			}
			function Rh(e, n) {
				(e.pooledCacheLanes &= n) === 0 && (n = e.pooledCache, n != null && (e.pooledCache = null, Da(n)));
			}
			function el() {
				return Ch(), Th(), _h(), Eh();
			}
			function Eh() {
				if (Rn !== Cm) return !1;
				var e = Nl, n = jg;
				jg = 0;
				var o = ar(qo), i = 32 > o ? 32 : o;
				o = x.T;
				var s = wt();
				try {
					an(i), x.T = null;
					var u = Wg;
					Wg = null, i = Nl;
					var f = qo;
					if (Rn = Ll, xd = Nl = null, qo = 0, (ye & (Zn | uo)) !== Jn) throw Error("Cannot flush passive effects while already rendering.");
					En(f), Bg = !0, Tm = !1;
					var p = 0;
					if (pi = null, p = me(), Go === rb) {
						var g = fi, S = p;
						!Me || S <= g || (sd ? sd.run(console.timeStamp.bind(console, "Animating", g, S, fe, "Scheduler ⚛", "secondary-dark")) : console.timeStamp("Animating", g, S, fe, "Scheduler ⚛", "secondary-dark"));
					} else {
						g = fi, S = p;
						var T = Go === Ag;
						!Me || S <= g || (gn ? gn.run(console.timeStamp.bind(console, T ? "Waiting for Paint" : "Waiting", g, S, fe, "Scheduler ⚛", "secondary-light")) : console.timeStamp(T ? "Waiting for Paint" : "Waiting", g, S, fe, "Scheduler ⚛", "secondary-light"));
					}
					g = ye, ye |= uo;
					var _ = i.current;
					Gl(), dh(_);
					var I = i.current;
					_ = Dg, Gl(), lh(i, I, f, u, _), Df(i), ye = g;
					var O = me();
					if (I = p, _ = gn, pi !== null ? ir(I, O, pi, !0, _) : !Me || O <= I || (_ ? _.run(console.timeStamp.bind(console, "Remaining Effects", I, O, fe, "Scheduler ⚛", "secondary-dark")) : console.timeStamp("Remaining Effects", I, O, fe, "Scheduler ⚛", "secondary-dark")), Za(f, O), Wa(0, !1), Tm ? i === Cp ? cu++ : (cu = 0, Cp = i) : cu = 0, Tm = Bg = !1, zt && typeof zt.onPostCommitFiberRoot == "function") try {
						zt.onPostCommitFiberRoot(td, i);
					} catch (Fe) {
						ka || (ka = !0, console.error("React instrumentation encountered an error: %o", Fe));
					}
					var K = i.current.stateNode;
					return K.effectDuration = 0, K.passiveEffectDuration = 0, !0;
				} finally {
					an(s), x.T = o, Rh(e, n);
				}
			}
			function Ih(e, n, o) {
				n = ft(o, n), Ud(n), n = oc(e.stateNode, n, 2), e = Mt(e, n, 2), e !== null && (Ci(e, 2), Kn(e));
			}
			function Se(e, n, o) {
				if (zd = !1, e.tag === 3) Ih(e, e, o);
				else {
					for (; n !== null;) {
						if (n.tag === 3) {
							Ih(n, e, o);
							return;
						}
						if (n.tag === 1) {
							var i = n.stateNode;
							if (typeof n.type.getDerivedStateFromError == "function" || typeof i.componentDidCatch == "function" && (Il === null || !Il.has(i))) {
								e = ft(o, e), Ud(e), o = ac(2), i = Mt(n, o, 2), i !== null && (ic(o, i, n, e), Ci(i, 2), Kn(i));
								return;
							}
						}
						n = n.return;
					}
					console.error(`Internal React error: Attempted to capture a commit phase error inside a detached tree. This indicates a bug in React. Potential causes include deleting the same fiber more than once, committing an already-finished tree, or an inconsistent return pointer.

Error message:

%s`, o);
				}
			}
			function Af(e, n, o) {
				var i = e.pingCache;
				if (i === null) {
					i = e.pingCache = new qb();
					var s = /* @__PURE__ */ new Set();
					i.set(n, s);
				} else s = i.get(n), s === void 0 && (s = /* @__PURE__ */ new Set(), i.set(n, s));
				s.has(o) || (Lg = !0, s.add(o), i = Qm.bind(null, e, n, o), wa && nl(e, o), n.then(i, i));
			}
			function Qm(e, n, o) {
				var i = e.pingCache;
				i !== null && i.delete(n), e.pingedLanes |= e.suspendedLanes & o, e.warmLanes &= ~o, (o & 127) !== 0 ? 0 > za && (Zs = za = xn(), ep = Yh("Promise Resolved"), Pl = 2) : o & 4194048 && 0 > ao && (hi = ao = xn(), tp = Yh("Promise Resolved"), sg = 2), mh() && x.actQueue === null && console.error(`A suspended resource finished loading inside a test, but the event was not wrapped in act(...).

When testing, code that resolves suspended data should be wrapped into act(...):

act(() => {
  /* finish loading suspended data */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act`), je === e && (ae & o) === o && (nn === Tl || nn === vm && (ae & 62914560) === ae && me() - xm < tb ? (ye & Zn) === Jn && Xi(e, 0) : Ng |= o, uu === ae && (uu = 0)), Kn(e);
			}
			function Lh(e, n) {
				n === 0 && (n = ut()), e = On(e, n), e !== null && (Ci(e, n), Kn(e));
			}
			function Nh(e) {
				var n = e.memoizedState, o = 0;
				n !== null && (o = n.retryLane), Lh(e, o);
			}
			function $m(e, n) {
				var o = 0;
				switch (e.tag) {
					case 31:
					case 13:
						var i = e.stateNode, s = e.memoizedState;
						s !== null && (o = s.retryLane);
						break;
					case 19:
						i = e.stateNode;
						break;
					case 22:
						i = e.stateNode._retryCache;
						break;
					default: throw Error("Pinged unknown suspense boundary type. This is probably a bug in React.");
				}
				i !== null && i.delete(n), Lh(e, o);
			}
			function jf(e, n, o) {
				if ((n.subtreeFlags & 67117056) !== 0) for (n = n.child; n !== null;) {
					var i = e, s = n, u = s.type === Lc;
					u = o || u, s.tag !== 22 ? s.flags & 67108864 ? u && B(s, Gt, i, s) : jf(i, s, u) : s.memoizedState === null && (u && s.flags & 8192 ? B(s, Gt, i, s) : s.subtreeFlags & 67108864 && B(s, jf, i, s, u)), n = n.sibling;
				}
			}
			function Gt(e, n) {
				De(!0);
				try {
					da(n), fh(n), ih(e, n.alternate, n, !1), sh(e, n, 0, null, !1, 0);
				} finally {
					De(!1);
				}
			}
			function Df(e) {
				var n = !0;
				e.current.mode & 24 || (n = !1), jf(e, e.current, n);
			}
			function zc(e) {
				if ((ye & Zn) === Jn) {
					var n = e.tag;
					if (n === 3 || n === 1 || n === 0 || n === 11 || n === 14 || n === 15) {
						if (n = G(e) || "ReactComponent", _m !== null) {
							if (_m.has(n)) return;
							_m.add(n);
						} else _m = new Set([n]);
						B(e, function() {
							console.error("Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component. Move this work to useEffect instead.");
						});
					}
				}
			}
			function nl(e, n) {
				wa && e.memoizedUpdaters.forEach(function(o) {
					yu(e, o, n);
				});
			}
			function Fh(e, n) {
				var o = x.actQueue;
				return o !== null ? (o.push(n), Zb) : Q(e, n);
			}
			function Hh(e) {
				mh() && x.actQueue === null && B(e, function() {
					console.error(`An update to %s inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act`, G(e));
				});
			}
			function Ya(e) {
				if (co === null) return e;
				var n = co(e);
				return n === void 0 ? e : n.current;
			}
			function Cc(e) {
				if (co === null) return e;
				var n = co(e);
				return n === void 0 ? e != null && typeof e.render == "function" && (n = Ya(e.render), e.render !== n) ? (n = {
					$$typeof: jn,
					render: n
				}, e.displayName !== void 0 && (n.displayName = e.displayName), n) : e : n.current;
			}
			function Wf(e, n) {
				if (co === null) return !1;
				var o = e.elementType;
				n = n.type;
				var i = !1, s = typeof n == "object" && n !== null ? n.$$typeof : null;
				switch (e.tag) {
					case 1:
						typeof n == "function" && (i = !0);
						break;
					case 0:
						(typeof n == "function" || s === kt) && (i = !0);
						break;
					case 11:
						(s === jn || s === kt) && (i = !0);
						break;
					case 14:
					case 15:
						(s === al || s === kt) && (i = !0);
						break;
					default: return !1;
				}
				return !!(i && (e = co(o), e !== void 0 && e === co(n)));
			}
			function Ah(e) {
				co !== null && typeof WeakSet == "function" && (Cd === null && (Cd = /* @__PURE__ */ new WeakSet()), Cd.add(e));
			}
			function jh(e, n, o) {
				do {
					var i = e, s = i.alternate, u = i.child, f = i.sibling, p = i.tag;
					i = i.type;
					var g = null;
					switch (p) {
						case 0:
						case 15:
						case 1:
							g = i;
							break;
						case 11: g = i.render;
					}
					if (co === null) throw Error("Expected resolveFamily to be set during hot reload.");
					var S = !1;
					if (i = !1, g !== null && (g = co(g), g !== void 0 && (o.has(g) ? i = !0 : n.has(g) && (p === 1 ? i = !0 : S = !0))), Cd !== null && (Cd.has(e) || s !== null && Cd.has(s)) && (i = !0), i && (e._debugNeedsRemount = !0), (i || S) && (s = On(e, 2), s !== null && We(s, e, 2)), u === null || i || jh(u, n, o), f === null) break;
					e = f;
				} while (!0);
			}
			function Vm(e, n, o, i) {
				this.tag = e, this.key = o, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = n, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = i, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null, this.actualDuration = -0, this.actualStartTime = -1.1, this.treeBaseDuration = this.selfBaseDuration = -0, this._debugTask = this._debugStack = this._debugOwner = this._debugInfo = null, this._debugNeedsRemount = !1, this._debugHookTypes = null, pb || typeof Object.preventExtensions != "function" || Object.preventExtensions(this);
			}
			function Tc(e) {
				return e = e.prototype, !(!e || !e.isReactComponent);
			}
			function Fo(e, n) {
				var o = e.alternate;
				switch (o === null ? (o = lt(e.tag, n, e.key, e.mode), o.elementType = e.elementType, o.type = e.type, o.stateNode = e.stateNode, o._debugOwner = e._debugOwner, o._debugStack = e._debugStack, o._debugTask = e._debugTask, o._debugHookTypes = e._debugHookTypes, o.alternate = e, e.alternate = o) : (o.pendingProps = n, o.type = e.type, o.flags = 0, o.subtreeFlags = 0, o.deletions = null, o.actualDuration = -0, o.actualStartTime = -1.1), o.flags = e.flags & 65011712, o.childLanes = e.childLanes, o.lanes = e.lanes, o.child = e.child, o.memoizedProps = e.memoizedProps, o.memoizedState = e.memoizedState, o.updateQueue = e.updateQueue, n = e.dependencies, o.dependencies = n === null ? null : {
					lanes: n.lanes,
					firstContext: n.firstContext,
					_debugThenableState: n._debugThenableState
				}, o.sibling = e.sibling, o.index = e.index, o.ref = e.ref, o.refCleanup = e.refCleanup, o.selfBaseDuration = e.selfBaseDuration, o.treeBaseDuration = e.treeBaseDuration, o._debugInfo = e._debugInfo, o._debugNeedsRemount = e._debugNeedsRemount, o.tag) {
					case 0:
					case 15:
						o.type = Ya(e.type);
						break;
					case 1:
						o.type = Ya(e.type);
						break;
					case 11: o.type = Cc(e.type);
				}
				return o;
			}
			function dn(e, n) {
				e.flags &= 65011714;
				var o = e.alternate;
				return o === null ? (e.childLanes = 0, e.lanes = n, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null, e.selfBaseDuration = 0, e.treeBaseDuration = 0) : (e.childLanes = o.childLanes, e.lanes = o.lanes, e.child = o.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = o.memoizedProps, e.memoizedState = o.memoizedState, e.updateQueue = o.updateQueue, e.type = o.type, n = o.dependencies, e.dependencies = n === null ? null : {
					lanes: n.lanes,
					firstContext: n.firstContext,
					_debugThenableState: n._debugThenableState
				}, e.selfBaseDuration = o.selfBaseDuration, e.treeBaseDuration = o.treeBaseDuration), e;
			}
			function _c(e, n, o, i, s, u) {
				var f = 0, p = e;
				if (typeof e == "function") Tc(e) && (f = 1), p = Ya(p);
				else if (typeof e == "string") Re && d ? (f = Rt(), f = Bo(e, o, f) ? 26 : L(e) ? 27 : 5) : Re ? (f = Rt(), f = Bo(e, o, f) ? 26 : 5) : f = d && L(e) ? 27 : 5;
				else e: switch (e) {
					case Ds: return n = lt(31, o, n, s), n.elementType = Ds, n.lanes = u, n;
					case ol: return fa(o.children, s, u, n);
					case Lc:
						f = 8, s |= 24;
						break;
					case Uf: return e = o, i = s, typeof e.id != "string" && console.error("Profiler must specify an \"id\" of type `string` as a prop. Received the type `%s` instead.", typeof e.id), n = lt(12, e, n, i | 2), n.elementType = Uf, n.lanes = u, n.stateNode = {
						effectDuration: 0,
						passiveEffectDuration: 0
					}, n;
					case Nc: return n = lt(13, o, n, s), n.elementType = Nc, n.lanes = u, n;
					case Bf: return n = lt(19, o, n, s), n.elementType = Bf, n.lanes = u, n;
					default:
						if (typeof e == "object" && e !== null) switch (e.$$typeof) {
							case on:
								f = 10;
								break e;
							case ei:
								f = 9;
								break e;
							case jn:
								f = 11, p = Cc(p);
								break e;
							case al:
								f = 14;
								break e;
							case kt:
								f = 16, p = null;
								break e;
						}
						p = "", (e === void 0 || typeof e == "object" && e !== null && Object.keys(e).length === 0) && (p += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), e === null ? o = "null" : fn(e) ? o = "array" : e !== void 0 && e.$$typeof === Ho ? (o = "<" + ($e(e.type) || "Unknown") + " />", p = " Did you accidentally export a JSX literal instead of a component?") : o = typeof e, f = i ? typeof i.tag == "number" ? G(i) : typeof i.name == "string" ? i.name : null : null, f && (p += `

Check the render method of \`` + f + "`."), f = 29, o = Error("Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + (o + "." + p)), p = null;
				}
				return n = lt(f, o, n, s), n.elementType = e, n.type = p, n.lanes = u, n._debugOwner = i, n;
			}
			function Rc(e, n, o) {
				return n = _c(e.type, e.key, e.props, e._owner, n, o), n._debugOwner = e._owner, n._debugStack = e._debugStack, n._debugTask = e._debugTask, n;
			}
			function fa(e, n, o, i) {
				return e = lt(7, e, i, n), e.lanes = o, e;
			}
			function Ec(e, n, o) {
				return e = lt(6, e, null, n), e.lanes = o, e;
			}
			function Xa(e) {
				var n = lt(18, null, null, Z);
				return n.stateNode = e, n;
			}
			function Hs(e, n, o) {
				return n = lt(4, e.children !== null ? e.children : [], e.key, n), n.lanes = o, n.stateNode = {
					containerInfo: e.containerInfo,
					pendingChildren: null,
					implementation: e.implementation
				}, n;
			}
			function tl(e, n, o, i, s, u, f, p, g) {
				for (this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = Yr, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = or(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = or(0), this.hiddenUpdates = or(null), this.identifierPrefix = i, this.onUncaughtError = s, this.onCaughtError = u, this.onRecoverableError = f, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = g, this.incompleteTransitions = /* @__PURE__ */ new Map(), this.passiveEffectDuration = this.effectDuration = -0, this.memoizedUpdaters = /* @__PURE__ */ new Set(), e = this.pendingUpdatersLaneMap = [], n = 0; 31 > n; n++) e.push(/* @__PURE__ */ new Set());
				this._debugRootType = o ? "hydrateRoot()" : "createRoot()";
			}
			function Ka(e, n, o, i, s, u, f, p, g, S, T, _) {
				return e = new tl(e, n, o, f, g, S, T, _, p), n = 1, u === !0 && (n |= 24), u = lt(3, null, null, n | 2), e.current = u, u.stateNode = e, n = Ai(), Po(n), e.pooledCache = n, Po(n), u.memoizedState = {
					element: i,
					isDehydrated: o,
					cache: n
				}, Au(u), e;
			}
			function vt(e) {
				return "" + e;
			}
			function Dh(e) {
				return e ? (e = Oe, e) : Oe;
			}
			function Wh(e, n, o, i) {
				return As(n.current, 2, e, n, o, i), 2;
			}
			function As(e, n, o, i, s, u) {
				if (zt && typeof zt.onScheduleFiberRoot == "function") try {
					zt.onScheduleFiberRoot(td, i, o);
				} catch (f) {
					ka || (ka = !0, console.error("React instrumentation encountered an error: %o", f));
				}
				s = Dh(s), i.context === null ? i.context = s : i.pendingContext = s, Pa && di !== null && !hb && (hb = !0, console.error(`Render methods should be a pure function of props and state; triggering nested component updates from render is not allowed. If necessary, trigger nested updates in componentDidUpdate.

Check the render method of %s.`, G(di) || "Unknown")), i = zo(n), i.payload = { element: o }, u = u === void 0 ? null : u, u !== null && (typeof u != "function" && console.error("Expected the last optional `callback` argument to be a function. Instead received: %s.", u), i.callback = u), o = Mt(e, i, n), o !== null && (ur(n, "root.render()", null), We(o, e, n), Bi(o, e, n));
			}
			function js(e, n) {
				if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
					var o = e.retryLane;
					e.retryLane = o !== 0 && o < n ? o : n;
				}
			}
			function rl(e, n) {
				js(e, n), (e = e.alternate) && js(e, n);
			}
			function Ic() {
				return di;
			}
			var le = {}, qm = import_react.default, St = import_scheduler.default, ze = Object.assign, Uh = Symbol.for("react.element"), Ho = Symbol.for("react.transitional.element"), Ao = Symbol.for("react.portal"), ol = Symbol.for("react.fragment"), Lc = Symbol.for("react.strict_mode"), Uf = Symbol.for("react.profiler"), ei = Symbol.for("react.consumer"), on = Symbol.for("react.context"), jn = Symbol.for("react.forward_ref"), Nc = Symbol.for("react.suspense"), Bf = Symbol.for("react.suspense_list"), al = Symbol.for("react.memo"), kt = Symbol.for("react.lazy");
			var Ds = Symbol.for("react.activity");
			var Bh = Symbol.for("react.memo_cache_sentinel");
			var ni = Symbol.iterator, il = Symbol.for("react.client.reference"), fn = Array.isArray, x = qm.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Jt = m.rendererVersion, Zt = m.rendererPackageName, jo = m.extraDevToolsConfig, ot = m.getPublicInstance, Zr = m.getRootHostContext, Dn = m.getChildHostContext, Ws = m.prepareForCommit, pa = m.resetAfterCommit, Fc = m.createInstance;
			m.cloneMutableInstance;
			var bn = m.appendInitialChild, Ue = m.finalizeInitialChildren, ue = m.shouldSetTextContent, Do = m.createTextInstance;
			m.cloneMutableTextInstance;
			var Yt = m.scheduleTimeout, Of = m.cancelTimeout, Yr = m.noTimeout, at = m.isPrimaryRenderer;
			m.warnsIfNotActing;
			var Be = m.supportsMutation, Xr = m.supportsPersistence, qn = m.supportsHydration, Gm = m.getInstanceFromNode;
			m.beforeActiveInstanceBlur;
			var qe = m.preparePortalMount;
			m.prepareScopeUpdate, m.getInstanceFromScope;
			var an = m.setCurrentUpdatePriority, wt = m.getCurrentUpdatePriority, Mf = m.resolveUpdatePriority, ll = m.trackSchedulerEvent, ti = m.resolveEventType, Pr = m.resolveEventTimeStamp, Us = m.shouldAttemptEagerTransition, Qf = m.detachDeletedInstance;
			m.requestPostPaintCallback;
			var sl = m.maySuspendCommit, ul = m.maySuspendCommitOnUpdate, Hc = m.maySuspendCommitInSyncRender, ha = m.preloadInstance, cl = m.startSuspendingCommit, Ac = m.suspendInstance;
			m.suspendOnActiveViewTransition;
			var jc = m.waitForCommitToBeReady, Dc = m.getSuspendedCommitReason, Xt = m.NotPendingTransition, Kt = m.HostTransitionContext, Bs = m.resetFormInstance, ri = m.bindToConsole, Oh = m.supportsMicrotasks, er = m.scheduleMicrotask, xr = m.supportsTestSelectors, $f = m.findFiberRoot, ma = m.getBoundingRect, Vf = m.getTextContent, Kr = m.isHiddenSubtree, Wc = m.matchAccessibilityRole, Ft = m.setFocusIfFocusable, zr = m.setupIntersectionObserver, ln = m.appendChild, Wo = m.appendChildToContainer, ne = m.commitTextUpdate, Ie = m.commitMount, pn = m.commitUpdate, Uc = m.insertBefore, dl = m.insertInContainerBefore, oi = m.removeChild, Bc = m.removeChildFromContainer, fl = m.resetTextContent, pl = m.hideInstance, Jm = m.hideTextInstance, Os = m.unhideInstance, Mh = m.unhideTextInstance;
			m.cancelViewTransitionName, m.cancelRootViewTransitionName, m.restoreRootViewTransitionName, m.cloneRootViewTransitionContainer, m.removeRootViewTransitionClone, m.measureClonedInstance, m.hasInstanceChanged, m.hasInstanceAffectedParent, m.startViewTransition, m.startGestureTransition, m.stopViewTransition, m.getCurrentGestureOffset, m.createViewTransitionInstance;
			var qf = m.clearContainer;
			m.createFragmentInstance, m.updateFragmentInstanceFiber, m.commitNewChildToFragmentInstance, m.deleteChildFromFragmentInstance;
			var Qh = m.cloneInstance, Oc = m.createContainerChildSet, Mc = m.appendChildToContainerChildSet, hn = m.finalizeContainerChildren, Qc = m.replaceContainerChildren, eo = m.cloneHiddenInstance, sn = m.cloneHiddenTextInstance, Ms = m.isSuspenseInstancePending, $c = m.isSuspenseInstanceFallback, Pn = m.getSuspenseInstanceFallbackErrorDetails, mn = m.registerSuspenseInstanceRetry, Pt = m.canHydrateFormStateMarker, Cr = m.isFormStateMarkerMatching, ga = m.getNextHydratableSibling, Zm = m.getNextHydratableSiblingAfterSingleton, Vc = m.getFirstHydratableChild, qc = m.getFirstHydratableChildWithinContainer, Gc = m.getFirstHydratableChildWithinActivityInstance, Jc = m.getFirstHydratableChildWithinSuspenseInstance, Zc = m.getFirstHydratableChildWithinSingleton, Qs = m.canHydrateInstance, Ym = m.canHydrateTextInstance, ce = m.canHydrateActivityInstance, Ne = m.canHydrateSuspenseInstance, de = m.hydrateInstance, he = m.hydrateTextInstance, _e = m.hydrateActivityInstance, Ht = m.hydrateSuspenseInstance, ya = m.getNextHydratableInstanceAfterActivityInstance, ai = m.getNextHydratableInstanceAfterSuspenseInstance, Gf = m.commitHydratedInstance, Uo = m.commitHydratedContainer, Xe = m.commitHydratedActivityInstance, ba = m.commitHydratedSuspenseInstance, ii = m.finalizeHydratedChildren, Jf = m.flushHydrationEvents;
			m.clearActivityBoundary;
			var At = m.clearSuspenseBoundary;
			m.clearActivityBoundaryFromContainer;
			var hl = m.clearSuspenseBoundaryFromContainer, $s = m.hideDehydratedBoundary, xt = m.unhideDehydratedBoundary, Yc = m.shouldDeleteUnhydratedTailInstances, Vs = m.diffHydratedPropsForDevWarnings, Zf = m.diffHydratedTextForDevWarnings, ml = m.describeHydratableInstanceForDevWarnings, Xc = m.validateHydratableInstance, va = m.validateHydratableTextInstance, Re = m.supportsResources, Bo = m.isHostHoistableType, Sa = m.getHoistableRoot, no = m.getResource, Kc = m.acquireResource, ed = m.releaseResource, $h = m.hydrateHoistable, gl = m.mountHoistable, nd = m.unmountHoistable, t = m.createHoistableInstance, r = m.prepareToCommitHoistables, a = m.mayResourceSuspendCommit, l = m.preloadResource, c = m.suspendResource, d = m.supportsSingletons, h = m.resolveSingletonInstance, y = m.acquireSingletonInstance, R = m.releaseSingletonInstance, L = m.isHostSingletonType, j = m.isSingletonScope, A = [], W = [], V = -1, Oe = {};
			Object.freeze(Oe);
			var vn = Math.clz32 ? Math.clz32 : Im, li = Math.log, P = Math.LN2, w = 256, C = 262144, H = 4194304, Q = St.unstable_scheduleCallback, Ge = St.unstable_cancelCallback, J = St.unstable_shouldYield, Pe = St.unstable_requestPaint, me = St.unstable_now, be = St.unstable_ImmediatePriority, Oo = St.unstable_UserBlockingPriority, qs = St.unstable_NormalPriority, Qg = St.unstable_IdlePriority, Ib = St.log, Lb = St.unstable_setDisableYieldValue, td = null, zt = null, ka = !1, wa = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u", $g = 0;
			if (typeof performance == "object" && typeof performance.now == "function") var Nb = performance, Vg = function() {
				return Nb.now();
			};
			else {
				var Fb = Date;
				Vg = function() {
					return Fb.now();
				};
			}
			var jt = typeof Object.is == "function" ? Object.is : Ti, qg = typeof reportError == "function" ? reportError : function(e) {
				if (typeof window == "object" && typeof window.ErrorEvent == "function") {
					var n = new window.ErrorEvent("error", {
						bubbles: !0,
						cancelable: !0,
						message: typeof e == "object" && e !== null && typeof e.message == "string" ? String(e.message) : String(e),
						error: e
					});
					if (!window.dispatchEvent(n)) return;
				} else if (typeof process == "object" && typeof process.emit == "function") {
					process.emit("uncaughtException", e);
					return;
				}
				console.error(e);
			}, Xm = Object.prototype.hasOwnProperty, Me = typeof console < "u" && typeof console.timeStamp == "function" && typeof performance < "u" && typeof performance.measure == "function", fe = "Blocking", yl = !1, si = {
				color: "primary",
				properties: null,
				tooltipText: "",
				track: "Components ⚛"
			}, bl = {
				start: -0,
				end: -0,
				detail: { devtools: si }
			}, Hb = ["Changed Props", ""], Ab = ["Changed Props", "This component received deeply equal props. It might benefit from useMemo or the React Compiler in its owner."], Yf = 0, Gg, Jg, Zg, Yg, Xg, Kg, ey;
			Ea.__reactDisabledLog = !0;
			var Km, ny, eg = !1, ng = new (typeof WeakMap == "function" ? WeakMap : Map)(), tg = /* @__PURE__ */ new WeakMap(), rd = [], od = 0, Vh = null, Xf = 0, to = [], ro = 0, Gs = null, ui = 1, ci = "", vl = st(null), Kf = st(null), Sl = st(null), qh = st(null), ty = /["'&<>\n\t]|^\s|\s$/, di = null, Pa = !1, it = null, Ke = null, ge = !1, xa = !1, Tr = null, kl = null, oo = !1, rg = Error("Hydration Mismatch Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React."), Z = 0, Gh = st(null), og = st(null), ag = st(null), Jh = {}, Zh = null, ad = null, id = !1, jb = typeof AbortController < "u" ? AbortController : function() {
				var e = [], n = this.signal = {
					aborted: !1,
					addEventListener: function(o, i) {
						e.push(i);
					}
				};
				this.abort = function() {
					n.aborted = !0, e.forEach(function(o) {
						return o();
					});
				};
			}, Db = St.unstable_scheduleCallback, Wb = St.unstable_NormalPriority, un = {
				$$typeof: on,
				Consumer: null,
				Provider: null,
				_currentValue: null,
				_currentValue2: null,
				_threadCount: 0,
				_currentRenderer: null,
				_currentRenderer2: null
			}, xn = St.unstable_now, Yh = console.createTask ? console.createTask : function() {
				return null;
			}, Ct = -0, wl = -0, fi = -0, pi = null, Dt = -1.1, Js = -0, en = -0, $ = -1.1, q = -1.1, Je = null, cn = !1, Zs = -0, za = -1.1, ep = null, Pl = 0, ig = null, lg = null, Ys = -1.1, np = null, ld = -1.1, Xh = -1.1, hi = -0, mi = -1.1, ao = -1.1, sg = 0, tp = null, ry = null, oy = null, xl = -1.1, Xs = null, zl = -1.1, Kh = -1.1, sd = null, ay = 0, rp = -1.1, em = !1, nm = !1, tm = null, ud = null, ug = !1, cg = !1, rm = !1, dg = !1, Ks = 0, fg = {}, op = null, pg = 0, eu = 0, cd = null, iy = x.S;
			x.S = function(e, n) {
				if (nb = me(), typeof n == "object" && n !== null && typeof n.then == "function") {
					if (0 > mi && 0 > ao) {
						mi = xn();
						var o = Pr(), i = ti();
						(o !== zl || i !== Xs) && (zl = -1.1), xl = o, Xs = i;
					}
					jp(e, n);
				}
				iy !== null && iy(e, n);
			};
			var nu = st(null), Mo = {
				recordUnsafeLifecycleWarnings: function() {},
				flushPendingUnsafeLifecycleWarnings: function() {},
				recordLegacyContextWarning: function() {},
				flushLegacyContextWarning: function() {},
				discardPendingWarnings: function() {}
			}, ap = [], ip = [], lp = [], sp = [], up = [], cp = [], tu = /* @__PURE__ */ new Set();
			Mo.recordUnsafeLifecycleWarnings = function(e, n) {
				tu.has(e.type) || (typeof n.componentWillMount == "function" && n.componentWillMount.__suppressDeprecationWarning !== !0 && ap.push(e), e.mode & 8 && typeof n.UNSAFE_componentWillMount == "function" && ip.push(e), typeof n.componentWillReceiveProps == "function" && n.componentWillReceiveProps.__suppressDeprecationWarning !== !0 && lp.push(e), e.mode & 8 && typeof n.UNSAFE_componentWillReceiveProps == "function" && sp.push(e), typeof n.componentWillUpdate == "function" && n.componentWillUpdate.__suppressDeprecationWarning !== !0 && up.push(e), e.mode & 8 && typeof n.UNSAFE_componentWillUpdate == "function" && cp.push(e));
			}, Mo.flushPendingUnsafeLifecycleWarnings = function() {
				var e = /* @__PURE__ */ new Set();
				0 < ap.length && (ap.forEach(function(p) {
					e.add(G(p) || "Component"), tu.add(p.type);
				}), ap = []);
				var n = /* @__PURE__ */ new Set();
				0 < ip.length && (ip.forEach(function(p) {
					n.add(G(p) || "Component"), tu.add(p.type);
				}), ip = []);
				var o = /* @__PURE__ */ new Set();
				0 < lp.length && (lp.forEach(function(p) {
					o.add(G(p) || "Component"), tu.add(p.type);
				}), lp = []);
				var i = /* @__PURE__ */ new Set();
				0 < sp.length && (sp.forEach(function(p) {
					i.add(G(p) || "Component"), tu.add(p.type);
				}), sp = []);
				var s = /* @__PURE__ */ new Set();
				0 < up.length && (up.forEach(function(p) {
					s.add(G(p) || "Component"), tu.add(p.type);
				}), up = []);
				var u = /* @__PURE__ */ new Set();
				if (0 < cp.length && (cp.forEach(function(p) {
					u.add(G(p) || "Component"), tu.add(p.type);
				}), cp = []), 0 < n.size) {
					var f = Lr(n);
					console.error(`Using UNSAFE_componentWillMount in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code with side effects to componentDidMount, and set initial state in the constructor.

Please update the following components: %s`, f);
				}
				0 < i.size && (f = Lr(i), console.error(`Using UNSAFE_componentWillReceiveProps in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state

Please update the following components: %s`, f)), 0 < u.size && (f = Lr(u), console.error(`Using UNSAFE_componentWillUpdate in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.

Please update the following components: %s`, f)), 0 < e.size && (f = Lr(e), console.warn(`componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code with side effects to componentDidMount, and set initial state in the constructor.
* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`, f)), 0 < o.size && (f = Lr(o), console.warn(`componentWillReceiveProps has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state
* Rename componentWillReceiveProps to UNSAFE_componentWillReceiveProps to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`, f)), 0 < s.size && (f = Lr(s), console.warn(`componentWillUpdate has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* Rename componentWillUpdate to UNSAFE_componentWillUpdate to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`, f));
			};
			var om = /* @__PURE__ */ new Map(), ly = /* @__PURE__ */ new Set();
			Mo.recordLegacyContextWarning = function(e, n) {
				for (var o = null, i = e; i !== null;) i.mode & 8 && (o = i), i = i.return;
				o === null ? console.error("Expected to find a StrictMode component in a strict mode tree. This error is likely caused by a bug in React. Please file an issue.") : !ly.has(e.type) && (i = om.get(o), e.type.contextTypes != null || e.type.childContextTypes != null || n !== null && typeof n.getChildContext == "function") && (i === void 0 && (i = [], om.set(o, i)), i.push(e));
			}, Mo.flushLegacyContextWarning = function() {
				om.forEach(function(e) {
					if (e.length !== 0) {
						var n = e[0], o = /* @__PURE__ */ new Set();
						e.forEach(function(s) {
							o.add(G(s) || "Component"), ly.add(s.type);
						});
						var i = Lr(o);
						B(n, function() {
							console.error(`Legacy context API has been detected within a strict-mode tree.

The old API will be supported in all 16.x releases, but applications using it should migrate to the new version.

Please update the following components: %s

Learn more about this warning here: https://react.dev/link/legacy-context`, i);
						});
					}
				});
			}, Mo.discardPendingWarnings = function() {
				ap = [], ip = [], lp = [], sp = [], up = [], cp = [], om = /* @__PURE__ */ new Map();
			};
			var sy = { react_stack_bottom_frame: function(e, n, o) {
				var i = Pa;
				Pa = !0;
				try {
					return e(n, o);
				} finally {
					Pa = i;
				}
			} }, hg = sy.react_stack_bottom_frame.bind(sy), uy = { react_stack_bottom_frame: function(e) {
				var n = Pa;
				Pa = !0;
				try {
					return e.render();
				} finally {
					Pa = n;
				}
			} }, cy = uy.react_stack_bottom_frame.bind(uy), dy = { react_stack_bottom_frame: function(e, n) {
				try {
					n.componentDidMount();
				} catch (o) {
					Se(e, e.return, o);
				}
			} }, mg = dy.react_stack_bottom_frame.bind(dy), fy = { react_stack_bottom_frame: function(e, n, o, i, s) {
				try {
					n.componentDidUpdate(o, i, s);
				} catch (u) {
					Se(e, e.return, u);
				}
			} }, py = fy.react_stack_bottom_frame.bind(fy), hy = { react_stack_bottom_frame: function(e, n) {
				var o = n.stack;
				e.componentDidCatch(n.value, { componentStack: o !== null ? o : "" });
			} }, Ub = hy.react_stack_bottom_frame.bind(hy), my = { react_stack_bottom_frame: function(e, n, o) {
				try {
					o.componentWillUnmount();
				} catch (i) {
					Se(e, n, i);
				}
			} }, gy = my.react_stack_bottom_frame.bind(my), yy = { react_stack_bottom_frame: function(e) {
				var n = e.create;
				return e = e.inst, n = n(), e.destroy = n;
			} }, Bb = yy.react_stack_bottom_frame.bind(yy), by = { react_stack_bottom_frame: function(e, n, o) {
				try {
					o();
				} catch (i) {
					Se(e, n, i);
				}
			} }, Ob = by.react_stack_bottom_frame.bind(by), vy = { react_stack_bottom_frame: function(e) {
				var n = e._init;
				return n(e._payload);
			} }, Mb = vy.react_stack_bottom_frame.bind(vy), dd = Error("Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."), gg = Error("Suspense Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React."), am = Error("Suspense Exception: This is not a real error! It's an implementation detail of `useActionState` to interrupt the current render. You must either rethrow it immediately, or move the `useActionState` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary."), im = { then: function() {
				console.error("Internal React error: A listener was unexpectedly attached to a \"noop\" thenable. This is a bug in React. Please file an issue.");
			} }, ru = null, dp = !1, fd = null, fp = 0, oe = null, yg, Sy = yg = !1, ky = {}, wy = {}, Py = {};
			Zo = function(e, n, o) {
				if (o !== null && typeof o == "object" && o._store && (!o._store.validated && o.key == null || o._store.validated === 2)) {
					if (typeof o._store != "object") throw Error("React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue.");
					o._store.validated = 1;
					var i = G(e), s = i || "null";
					if (!ky[s]) {
						ky[s] = !0, o = o._owner, e = e._debugOwner;
						var u = "";
						e && typeof e.tag == "number" && (s = G(e)) && (u = `

Check the render method of \`` + s + "`."), u || i && (u = `

Check the top-level render call using <` + i + ">.");
						var f = "";
						o != null && e !== o && (i = null, typeof o.tag == "number" ? i = G(o) : typeof o.name == "string" && (i = o.name), i && (f = " It was passed a child from " + i + ".")), B(n, function() {
							console.error("Each child in a list should have a unique \"key\" prop.%s%s See https://react.dev/link/warning-keys for more information.", u, f);
						});
					}
				}
			};
			var ou = rs(!0), xy = rs(!1), pp = 1, gi = 2, io = [], pd = 0, bg = 0, zy = 0, Cy = 1, Ty = 2, vg = 3, Cl = !1, _y = !1, Sg = null, kg = !1, hd = st(null), lm = st(0), _r = st(null), Qo = null, md = 1, hp = 2, Sn = st(0), sm = 0, lo = 1, Wt = 2, Rr = 4, Ut = 8, gd, Ry = /* @__PURE__ */ new Set(), Ey = /* @__PURE__ */ new Set(), wg = /* @__PURE__ */ new Set(), Iy = /* @__PURE__ */ new Set(), yi = 0, Y = null, Ae = null, zn = null, um = !1, yd = !1, au = !1, cm = 0, mp = 0, bi = null, Qb = 0, $b = 25, z = null, so = null, vi = -1, gp = !1, yp = {
				readContext: Ee,
				use: we,
				useCallback: Ye,
				useContext: Ye,
				useEffect: Ye,
				useImperativeHandle: Ye,
				useLayoutEffect: Ye,
				useInsertionEffect: Ye,
				useMemo: Ye,
				useReducer: Ye,
				useRef: Ye,
				useState: Ye,
				useDebugValue: Ye,
				useDeferredValue: Ye,
				useTransition: Ye,
				useSyncExternalStore: Ye,
				useId: Ye,
				useHostTransitionStatus: Ye,
				useFormState: Ye,
				useActionState: Ye,
				useOptimistic: Ye,
				useMemoCache: Ye,
				useCacheRefresh: Ye
			};
			yp.useEffectEvent = Ye;
			var Pg = null, Ly = null, xg = null, Ny = null, Ca = null, $o = null, dm = null;
			Pg = {
				readContext: function(e) {
					return Ee(e);
				},
				use: we,
				useCallback: function(e, n) {
					return z = "useCallback", ee(), gt(n), Ku(e, n);
				},
				useContext: function(e) {
					return z = "useContext", ee(), Ee(e);
				},
				useEffect: function(e, n) {
					return z = "useEffect", ee(), gt(n), yt(e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", ee(), gt(o), Xu(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					z = "useInsertionEffect", ee(), gt(n), To(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", ee(), gt(n), _o(e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", ee(), gt(n);
					var o = x.H;
					x.H = Ca;
					try {
						return ec(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", ee();
					var i = x.H;
					x.H = Ca;
					try {
						return $u(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function(e) {
					return z = "useRef", ee(), br(e);
				},
				useState: function(e) {
					z = "useState", ee();
					var n = x.H;
					x.H = Ca;
					try {
						return $i(e);
					} finally {
						x.H = n;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", ee();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", ee(), ms(e, n);
				},
				useTransition: function() {
					return z = "useTransition", ee(), tc();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", ee(), Vu(e, n, o);
				},
				useId: function() {
					return z = "useId", ee(), bs();
				},
				useFormState: function(e, n) {
					return z = "useFormState", ee(), Mi(), tn(e, n);
				},
				useActionState: function(e, n) {
					return z = "useActionState", ee(), tn(e, n);
				},
				useOptimistic: function(e) {
					return z = "useOptimistic", ee(), Ju(e);
				},
				useHostTransitionStatus: ia,
				useMemoCache: Oa,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", ee(), la();
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", ee(), ra(e);
				}
			}, Ly = {
				readContext: function(e) {
					return Ee(e);
				},
				use: we,
				useCallback: function(e, n) {
					return z = "useCallback", N(), Ku(e, n);
				},
				useContext: function(e) {
					return z = "useContext", N(), Ee(e);
				},
				useEffect: function(e, n) {
					return z = "useEffect", N(), yt(e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", N(), Xu(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					z = "useInsertionEffect", N(), To(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", N(), _o(e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", N();
					var o = x.H;
					x.H = Ca;
					try {
						return ec(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", N();
					var i = x.H;
					x.H = Ca;
					try {
						return $u(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function(e) {
					return z = "useRef", N(), br(e);
				},
				useState: function(e) {
					z = "useState", N();
					var n = x.H;
					x.H = Ca;
					try {
						return $i(e);
					} finally {
						x.H = n;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", N();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", N(), ms(e, n);
				},
				useTransition: function() {
					return z = "useTransition", N(), tc();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", N(), Vu(e, n, o);
				},
				useId: function() {
					return z = "useId", N(), bs();
				},
				useActionState: function(e, n) {
					return z = "useActionState", N(), tn(e, n);
				},
				useFormState: function(e, n) {
					return z = "useFormState", N(), Mi(), tn(e, n);
				},
				useOptimistic: function(e) {
					return z = "useOptimistic", N(), Ju(e);
				},
				useHostTransitionStatus: ia,
				useMemoCache: Oa,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", N(), la();
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", N(), ra(e);
				}
			}, xg = {
				readContext: function(e) {
					return Ee(e);
				},
				use: we,
				useCallback: function(e, n) {
					return z = "useCallback", N(), Ma(e, n);
				},
				useContext: function(e) {
					return z = "useContext", N(), Ee(e);
				},
				useEffect: function(e, n) {
					z = "useEffect", N(), Qn(2048, Ut, e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", N(), aa(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					return z = "useInsertionEffect", N(), Qn(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", N(), Qn(4, Rr, e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", N();
					var o = x.H;
					x.H = $o;
					try {
						return Vi(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", N();
					var i = x.H;
					x.H = $o;
					try {
						return Br(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function() {
					return z = "useRef", N(), xe().memoizedState;
				},
				useState: function() {
					z = "useState", N();
					var e = x.H;
					x.H = $o;
					try {
						return Br(gr);
					} finally {
						x.H = e;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", N();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", N(), nc(e, n);
				},
				useTransition: function() {
					return z = "useTransition", N(), Qp();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", N(), ta(e, n, o);
				},
				useId: function() {
					return z = "useId", N(), xe().memoizedState;
				},
				useFormState: function(e) {
					return z = "useFormState", N(), Mi(), hs(e);
				},
				useActionState: function(e) {
					return z = "useActionState", N(), hs(e);
				},
				useOptimistic: function(e, n) {
					return z = "useOptimistic", N(), rf(e, n);
				},
				useHostTransitionStatus: ia,
				useMemoCache: Oa,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", N(), xe().memoizedState;
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", N(), oa(e);
				}
			}, Ny = {
				readContext: function(e) {
					return Ee(e);
				},
				use: we,
				useCallback: function(e, n) {
					return z = "useCallback", N(), Ma(e, n);
				},
				useContext: function(e) {
					return z = "useContext", N(), Ee(e);
				},
				useEffect: function(e, n) {
					z = "useEffect", N(), Qn(2048, Ut, e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", N(), aa(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					return z = "useInsertionEffect", N(), Qn(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", N(), Qn(4, Rr, e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", N();
					var o = x.H;
					x.H = dm;
					try {
						return Vi(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", N();
					var i = x.H;
					x.H = dm;
					try {
						return Qi(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function() {
					return z = "useRef", N(), xe().memoizedState;
				},
				useState: function() {
					z = "useState", N();
					var e = x.H;
					x.H = dm;
					try {
						return Qi(gr);
					} finally {
						x.H = e;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", N();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", N(), sf(e, n);
				},
				useTransition: function() {
					return z = "useTransition", N(), Ro();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", N(), ta(e, n, o);
				},
				useId: function() {
					return z = "useId", N(), xe().memoizedState;
				},
				useFormState: function(e) {
					return z = "useFormState", N(), Mi(), $t(e);
				},
				useActionState: function(e) {
					return z = "useActionState", N(), $t(e);
				},
				useOptimistic: function(e, n) {
					return z = "useOptimistic", N(), of(e, n);
				},
				useHostTransitionStatus: ia,
				useMemoCache: Oa,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", N(), xe().memoizedState;
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", N(), oa(e);
				}
			}, Ca = {
				readContext: function(e) {
					return Ce(), Ee(e);
				},
				use: function(e) {
					return D(), we(e);
				},
				useCallback: function(e, n) {
					return z = "useCallback", D(), ee(), Ku(e, n);
				},
				useContext: function(e) {
					return z = "useContext", D(), ee(), Ee(e);
				},
				useEffect: function(e, n) {
					return z = "useEffect", D(), ee(), yt(e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", D(), ee(), Xu(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					z = "useInsertionEffect", D(), ee(), To(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", D(), ee(), _o(e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", D(), ee();
					var o = x.H;
					x.H = Ca;
					try {
						return ec(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", D(), ee();
					var i = x.H;
					x.H = Ca;
					try {
						return $u(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function(e) {
					return z = "useRef", D(), ee(), br(e);
				},
				useState: function(e) {
					z = "useState", D(), ee();
					var n = x.H;
					x.H = Ca;
					try {
						return $i(e);
					} finally {
						x.H = n;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", D(), ee();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", D(), ee(), ms(e, n);
				},
				useTransition: function() {
					return z = "useTransition", D(), ee(), tc();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", D(), ee(), Vu(e, n, o);
				},
				useId: function() {
					return z = "useId", D(), ee(), bs();
				},
				useFormState: function(e, n) {
					return z = "useFormState", D(), ee(), tn(e, n);
				},
				useActionState: function(e, n) {
					return z = "useActionState", D(), ee(), tn(e, n);
				},
				useOptimistic: function(e) {
					return z = "useOptimistic", D(), ee(), Ju(e);
				},
				useMemoCache: function(e) {
					return D(), Oa(e);
				},
				useHostTransitionStatus: ia,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", ee(), la();
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", D(), ee(), ra(e);
				}
			}, $o = {
				readContext: function(e) {
					return Ce(), Ee(e);
				},
				use: function(e) {
					return D(), we(e);
				},
				useCallback: function(e, n) {
					return z = "useCallback", D(), N(), Ma(e, n);
				},
				useContext: function(e) {
					return z = "useContext", D(), N(), Ee(e);
				},
				useEffect: function(e, n) {
					z = "useEffect", D(), N(), Qn(2048, Ut, e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", D(), N(), aa(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					return z = "useInsertionEffect", D(), N(), Qn(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", D(), N(), Qn(4, Rr, e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", D(), N();
					var o = x.H;
					x.H = $o;
					try {
						return Vi(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", D(), N();
					var i = x.H;
					x.H = $o;
					try {
						return Br(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function() {
					return z = "useRef", D(), N(), xe().memoizedState;
				},
				useState: function() {
					z = "useState", D(), N();
					var e = x.H;
					x.H = $o;
					try {
						return Br(gr);
					} finally {
						x.H = e;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", D(), N();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", D(), N(), nc(e, n);
				},
				useTransition: function() {
					return z = "useTransition", D(), N(), Qp();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", D(), N(), ta(e, n, o);
				},
				useId: function() {
					return z = "useId", D(), N(), xe().memoizedState;
				},
				useFormState: function(e) {
					return z = "useFormState", D(), N(), hs(e);
				},
				useActionState: function(e) {
					return z = "useActionState", D(), N(), hs(e);
				},
				useOptimistic: function(e, n) {
					return z = "useOptimistic", D(), N(), rf(e, n);
				},
				useMemoCache: function(e) {
					return D(), Oa(e);
				},
				useHostTransitionStatus: ia,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", N(), xe().memoizedState;
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", D(), N(), oa(e);
				}
			}, dm = {
				readContext: function(e) {
					return Ce(), Ee(e);
				},
				use: function(e) {
					return D(), we(e);
				},
				useCallback: function(e, n) {
					return z = "useCallback", D(), N(), Ma(e, n);
				},
				useContext: function(e) {
					return z = "useContext", D(), N(), Ee(e);
				},
				useEffect: function(e, n) {
					z = "useEffect", D(), N(), Qn(2048, Ut, e, n);
				},
				useImperativeHandle: function(e, n, o) {
					return z = "useImperativeHandle", D(), N(), aa(e, n, o);
				},
				useInsertionEffect: function(e, n) {
					return z = "useInsertionEffect", D(), N(), Qn(4, Wt, e, n);
				},
				useLayoutEffect: function(e, n) {
					return z = "useLayoutEffect", D(), N(), Qn(4, Rr, e, n);
				},
				useMemo: function(e, n) {
					z = "useMemo", D(), N();
					var o = x.H;
					x.H = $o;
					try {
						return Vi(e, n);
					} finally {
						x.H = o;
					}
				},
				useReducer: function(e, n, o) {
					z = "useReducer", D(), N();
					var i = x.H;
					x.H = $o;
					try {
						return Qi(e, n, o);
					} finally {
						x.H = i;
					}
				},
				useRef: function() {
					return z = "useRef", D(), N(), xe().memoizedState;
				},
				useState: function() {
					z = "useState", D(), N();
					var e = x.H;
					x.H = $o;
					try {
						return Qi(gr);
					} finally {
						x.H = e;
					}
				},
				useDebugValue: function() {
					z = "useDebugValue", D(), N();
				},
				useDeferredValue: function(e, n) {
					return z = "useDeferredValue", D(), N(), sf(e, n);
				},
				useTransition: function() {
					return z = "useTransition", D(), N(), Ro();
				},
				useSyncExternalStore: function(e, n, o) {
					return z = "useSyncExternalStore", D(), N(), ta(e, n, o);
				},
				useId: function() {
					return z = "useId", D(), N(), xe().memoizedState;
				},
				useFormState: function(e) {
					return z = "useFormState", D(), N(), $t(e);
				},
				useActionState: function(e) {
					return z = "useActionState", D(), N(), $t(e);
				},
				useOptimistic: function(e, n) {
					return z = "useOptimistic", D(), N(), of(e, n);
				},
				useMemoCache: function(e) {
					return D(), Oa(e);
				},
				useHostTransitionStatus: ia,
				useCacheRefresh: function() {
					return z = "useCacheRefresh", N(), xe().memoizedState;
				},
				useEffectEvent: function(e) {
					return z = "useEffectEvent", D(), N(), oa(e);
				}
			};
			var Fy = {}, Hy = /* @__PURE__ */ new Set(), Ay = /* @__PURE__ */ new Set(), jy = /* @__PURE__ */ new Set(), Dy = /* @__PURE__ */ new Set(), Wy = /* @__PURE__ */ new Set(), Uy = /* @__PURE__ */ new Set(), By = /* @__PURE__ */ new Set(), Oy = /* @__PURE__ */ new Set(), My = /* @__PURE__ */ new Set(), Qy = /* @__PURE__ */ new Set();
			Object.freeze(Fy);
			var zg = {
				enqueueSetState: function(e, n, o) {
					e = e._reactInternals;
					var i = Nt(e), s = zo(i);
					s.payload = n, o != null && (df(o), s.callback = o), n = Mt(e, s, i), n !== null && (ur(i, "this.setState()", e), We(n, e, i), Bi(n, e, i));
				},
				enqueueReplaceState: function(e, n, o) {
					e = e._reactInternals;
					var i = Nt(e), s = zo(i);
					s.tag = Cy, s.payload = n, o != null && (df(o), s.callback = o), n = Mt(e, s, i), n !== null && (ur(i, "this.replaceState()", e), We(n, e, i), Bi(n, e, i));
				},
				enqueueForceUpdate: function(e, n) {
					e = e._reactInternals;
					var o = Nt(e), i = zo(o);
					i.tag = Ty, n != null && (df(n), i.callback = n), n = Mt(e, i, o), n !== null && (ur(o, "this.forceUpdate()", e), We(n, e, o), Bi(n, e, o));
				}
			}, bd = null, Cg = null, Tg = Error("This is not a real error. It's an implementation detail of React's selective hydration feature. If this leaks into userspace, it's a bug in React. Please file an issue."), Cn = !1, $y = {}, Vy = {}, qy = {}, Gy = {}, vd = !1, Jy = {}, fm = {}, _g = {
				dehydrated: null,
				treeContext: null,
				retryLane: 0,
				hydrationErrors: null
			}, Zy = !1, Yy = null;
			Yy = /* @__PURE__ */ new Set();
			var Si = !1, Tn = !1, Rg = !1, Xy = typeof WeakSet == "function" ? WeakSet : Set, Gn = null, Sd = null, kd = null, _n = null, nr = !1, Vo = null, Wn = !1, wd = 8192, Vb = {
				getCacheForType: function(e) {
					var n = Ee(un), o = n.data.get(e);
					return o === void 0 && (o = e(), n.data.set(e, o)), o;
				},
				cacheSignal: function() {
					return Ee(un).controller.signal;
				},
				getOwner: function() {
					return di;
				}
			}, pm = 0, hm = 1, mm = 2, gm = 3, ym = 4;
			if (typeof Symbol == "function" && Symbol.for) {
				var bp = Symbol.for;
				pm = bp("selector.component"), hm = bp("selector.has_pseudo_class"), mm = bp("selector.role"), gm = bp("selector.test_id"), ym = bp("selector.text");
			}
			var bm = [], qb = typeof WeakMap == "function" ? WeakMap : Map, Jn = 0, Zn = 2, uo = 4, ki = 0, vp = 1, iu = 2, vm = 3, Tl = 4, Sm = 6, Ky = 5, ye = Jn, je = null, se = null, ae = 0, tr = 0, km = 1, lu = 2, Sp = 3, eb = 4, Eg = 5, kp = 6, wm = 7, Ig = 8, su = 9, Le = tr, Er = null, _l = !1, Pd = !1, Lg = !1, Ta = 0, nn = ki, Rl = 0, El = 0, Ng = 0, rr = 0, uu = 0, wp = null, Bt = null, Pm = !1, xm = 0, nb = 0, tb = 300, Pp = Infinity, Fg = 500, xp = null, gn = null, Il = null, zm = 0, Hg = 1, Ag = 2, rb = 3, Ll = 0, ob = 1, ab = 2, ib = 3, lb = 4, Cm = 5, Rn = 0, Nl = null, xd = null, qo = 0, jg = 0, Dg = -0, Wg = null, sb = null, ub = null, Go = zm, cb = null, Gb = 50, zp = 0, Ug = null, Bg = !1, Tm = !1, Jb = 50, cu = 0, Cp = null, zd = !1, _m = null, db = !1, fb = /* @__PURE__ */ new Set(), Zb = {}, co = null, Cd = null, pb = !1;
			try {
				Object.preventExtensions({});
			} catch {
				pb = !0;
			}
			var hb = !1, mb = {}, gb = null, yb = null, bb = null, vb = null, Sb = null, kb = null, wb = null, Pb = null, xb = null, zb = null;
			return gb = function(e, n, o, i) {
				n = Yn(e, n), n !== null && (o = _d(n.memoizedState, o, 0, i), n.memoizedState = o, n.baseState = o, e.memoizedProps = ze({}, e.memoizedProps), o = On(e, 2), o !== null && We(o, e, 2));
			}, yb = function(e, n, o) {
				n = Yn(e, n), n !== null && (o = du(n.memoizedState, o, 0), n.memoizedState = o, n.baseState = o, e.memoizedProps = ze({}, e.memoizedProps), o = On(e, 2), o !== null && We(o, e, 2));
			}, bb = function(e, n, o, i) {
				n = Yn(e, n), n !== null && (o = F(n.memoizedState, o, i), n.memoizedState = o, n.baseState = o, e.memoizedProps = ze({}, e.memoizedProps), o = On(e, 2), o !== null && We(o, e, 2));
			}, vb = function(e, n, o) {
				e.pendingProps = _d(e.memoizedProps, n, 0, o), e.alternate && (e.alternate.pendingProps = e.pendingProps), n = On(e, 2), n !== null && We(n, e, 2);
			}, Sb = function(e, n) {
				e.pendingProps = du(e.memoizedProps, n, 0), e.alternate && (e.alternate.pendingProps = e.pendingProps), n = On(e, 2), n !== null && We(n, e, 2);
			}, kb = function(e, n, o) {
				e.pendingProps = F(e.memoizedProps, n, o), e.alternate && (e.alternate.pendingProps = e.pendingProps), n = On(e, 2), n !== null && We(n, e, 2);
			}, wb = function(e) {
				var n = On(e, 2);
				n !== null && We(n, e, 2);
			}, Pb = function(e) {
				var n = ut(), o = On(e, n);
				o !== null && We(o, e, n);
			}, xb = function(e) {
				pu = e;
			}, zb = function(e) {
				fu = e;
			}, le.attemptContinuousHydration = function(e) {
				if (e.tag === 13 || e.tag === 31) {
					var n = On(e, 67108864);
					n !== null && We(n, e, 67108864), rl(e, 67108864);
				}
			}, le.attemptHydrationAtCurrentPriority = function(e) {
				if (e.tag === 13 || e.tag === 31) {
					var n = Nt(e);
					n = Xo(n);
					var o = On(e, n);
					o !== null && We(o, e, n), rl(e, n);
				}
			}, le.attemptSynchronousHydration = function(e) {
				switch (e.tag) {
					case 3:
						if (e = e.stateNode, e.current.memoizedState.isDehydrated) {
							var n = _t(e.pendingLanes);
							if (n !== 0) {
								for (e.pendingLanes |= 2, e.entangledLanes |= 2; n;) {
									var o = 1 << 31 - vn(n);
									e.entanglements[1] |= o, n &= ~o;
								}
								Kn(e), (ye & (Zn | uo)) === Jn && (Pp = me() + Fg, Wa(0, !1));
							}
						}
						break;
					case 31:
					case 13: n = On(e, 2), n !== null && We(n, e, 2), Ls(), rl(e, 2);
				}
			}, le.batchedUpdates = function(e, n) {
				return e(n);
			}, le.createComponentSelector = function(e) {
				return {
					$$typeof: pm,
					value: e
				};
			}, le.createContainer = function(e, n, o, i, s, u, f, p, g, S) {
				return Ka(e, n, !1, null, o, i, u, null, f, p, g, S);
			}, le.createHasPseudoClassSelector = function(e) {
				return {
					$$typeof: hm,
					value: e
				};
			}, le.createHydrationContainer = function(e, n, o, i, s, u, f, p, g, S, T, _, I, O) {
				var _n2;
				return e = Ka(o, i, !0, e, s, u, p, O, g, S, T, _), e.context = Dh(null), o = e.current, i = Nt(o), i = Xo(i), s = zo(i), s.callback = (_n2 = n) != null ? _n2 : null, Mt(o, s, i), ur(i, "hydrateRoot()", null), n = i, e.current.lanes = n, Ci(e, n), Kn(e), e;
			}, le.createPortal = function(e, n, o) {
				var i = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
				try {
					vt(i);
					var s = !1;
				} catch {
					s = !0;
				}
				return s && (console.error("The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", typeof Symbol == "function" && Symbol.toStringTag && i[Symbol.toStringTag] || i.constructor.name || "Object"), vt(i)), {
					$$typeof: Ao,
					key: i == null ? null : "" + i,
					children: e,
					containerInfo: n,
					implementation: o
				};
			}, le.createRoleSelector = function(e) {
				return {
					$$typeof: mm,
					value: e
				};
			}, le.createTestNameSelector = function(e) {
				return {
					$$typeof: gm,
					value: e
				};
			}, le.createTextSelector = function(e) {
				return {
					$$typeof: ym,
					value: e
				};
			}, le.defaultOnCaughtError = function(e) {
				var n = bd ? "The above error occurred in the <" + bd + "> component." : "The above error occurred in one of your React components.", o = "React will try to recreate this component tree from scratch using the error boundary you provided, " + ((Cg || "Anonymous") + ".");
				typeof e == "object" && e !== null && typeof e.environmentName == "string" ? ri("error", [
					`%o

%s

%s
`,
					e,
					n,
					o
				], e.environmentName)() : console.error(`%o

%s

%s
`, e, n, o);
			}, le.defaultOnRecoverableError = function(e) {
				qg(e);
			}, le.defaultOnUncaughtError = function(e) {
				qg(e), console.warn(`%s

%s
`, bd ? "An error occurred in the <" + bd + "> component." : "An error occurred in one of your React components.", `Consider adding an error boundary to your tree to customize error handling behavior.
Visit https://react.dev/link/error-boundaries to learn more about error boundaries.`);
			}, le.deferredUpdates = function(e) {
				var n = x.T, o = wt();
				try {
					return an(32), x.T = null, e();
				} finally {
					an(o), x.T = n;
				}
			}, le.discreteUpdates = function(e, n, o, i, s) {
				var u = x.T, f = wt();
				try {
					return an(2), x.T = null, e(n, o, i, s);
				} finally {
					an(f), x.T = u, ye === Jn && (Pp = me() + Fg);
				}
			}, le.findAllNodes = kc, le.findBoundingRects = function(e, n) {
				if (!xr) throw Error("Test selector API is not supported by this renderer.");
				n = kc(e, n), e = [];
				for (var o = 0; o < n.length; o++) e.push(ma(n[o]));
				for (n = e.length - 1; 0 < n; n--) {
					o = e[n];
					for (var i = o.x, s = i + o.width, u = o.y, f = u + o.height, p = n - 1; 0 <= p; p--) if (n !== p) {
						var g = e[p], S = g.x, T = S + g.width, _ = g.y, I = _ + g.height;
						if (i >= S && u >= _ && s <= T && f <= I) {
							e.splice(n, 1);
							break;
						} else if (i !== S || o.width !== g.width || I < u || _ > f) {
							if (!(u !== _ || o.height !== g.height || T < i || S > s)) {
								S > i && (g.width += S - i, g.x = i), T < s && (g.width = s - S), e.splice(n, 1);
								break;
							}
						} else {
							_ > u && (g.height += _ - u, g.y = u), I < f && (g.height = f - _), e.splice(n, 1);
							break;
						}
					}
				}
				return e;
			}, le.findHostInstance = function(e) {
				var n = e._reactInternals;
				if (n === void 0) throw typeof e.render == "function" ? Error("Unable to find node on an unmounted component.") : (e = Object.keys(e).join(","), Error("Argument appears to not be a ReactComponent. Keys: " + e));
				return e = mu(n), e === null ? null : ot(e.stateNode);
			}, le.findHostInstanceWithNoPortals = function(e) {
				return e = Ed(e), e = e !== null ? _p(e) : null, e === null ? null : ot(e.stateNode);
			}, le.findHostInstanceWithWarning = function(e, n) {
				var o = e._reactInternals;
				if (o === void 0) throw typeof e.render == "function" ? Error("Unable to find node on an unmounted component.") : (e = Object.keys(e).join(","), Error("Argument appears to not be a ReactComponent. Keys: " + e));
				if (e = mu(o), e === null) return null;
				if (e.mode & 8) {
					var i = G(o) || "Component";
					mb[i] || (mb[i] = !0, B(e, function() {
						o.mode & 8 ? console.error("%s is deprecated in StrictMode. %s was passed an instance of %s which is inside StrictMode. Instead, add a ref directly to the element you want to reference. Learn more about using refs safely here: https://react.dev/link/strict-mode-find-node", n, n, i) : console.error("%s is deprecated in StrictMode. %s was passed an instance of %s which renders StrictMode children. Instead, add a ref directly to the element you want to reference. Learn more about using refs safely here: https://react.dev/link/strict-mode-find-node", n, n, i);
					}));
				}
				return ot(e.stateNode);
			}, le.flushPassiveEffects = el, le.flushSyncFromReconciler = function(e) {
				var n = ye;
				ye |= 1;
				var o = x.T, i = wt();
				try {
					if (an(2), x.T = null, e) return e();
				} finally {
					an(i), x.T = o, ye = n, (ye & (Zn | uo)) === Jn && Wa(0, !1);
				}
			}, le.flushSyncWork = Ls, le.focusWithin = function(e, n) {
				if (!xr) throw Error("Test selector API is not supported by this renderer.");
				for (e = Ef(e), n = hh(e, n), n = Array.from(n), e = 0; e < n.length;) {
					var o = n[e++], i = o.tag;
					if (!Kr(o)) {
						if ((i === 5 || i === 26 || i === 27) && Ft(o.stateNode)) return !0;
						for (o = o.child; o !== null;) n.push(o), o = o.sibling;
					}
				}
				return !1;
			}, le.getFindAllNodesFailureDescription = function(e, n) {
				if (!xr) throw Error("Test selector API is not supported by this renderer.");
				var o = 0, i = [];
				e = [Ef(e), 0];
				for (var s = 0; s < e.length;) {
					var u = e[s++], f = u.tag, p = e[s++], g = n[p];
					if ((f !== 5 && f !== 26 && f !== 27 || !Kr(u)) && (If(u, g) && (i.push(Sc(g)), p++, p > o && (o = p)), p < n.length)) for (u = u.child; u !== null;) e.push(u, p), u = u.sibling;
				}
				if (o < n.length) {
					for (e = []; o < n.length; o++) e.push(Sc(n[o]));
					return `findAllNodes was able to match part of the selector:
  ` + (i.join(" > ") + `

No matching component was found for:
  `) + e.join(" > ");
				}
				return null;
			}, le.getPublicRootInstance = function(e) {
				if (e = e.current, !e.child) return null;
				switch (e.child.tag) {
					case 27:
					case 5: return ot(e.child.stateNode);
					default: return e.child.stateNode;
				}
			}, le.injectIntoDevTools = function() {
				var e = {
					bundleType: 1,
					version: Jt,
					rendererPackageName: Zt,
					currentDispatcherRef: x,
					reconcilerVersion: "19.2.0"
				};
				return jo !== null && (e.rendererConfig = jo), e.overrideHookState = gb, e.overrideHookStateDeletePath = yb, e.overrideHookStateRenamePath = bb, e.overrideProps = vb, e.overridePropsDeletePath = Sb, e.overridePropsRenamePath = kb, e.scheduleUpdate = wb, e.scheduleRetry = Pb, e.setErrorHandler = xb, e.setSuspenseHandler = zb, e.scheduleRefresh = hu, e.scheduleRoot = Fl, e.setRefreshHandler = Ir, e.getCurrentFiber = Ic, Ep(e);
			}, le.isAlreadyRendering = Ns, le.observeVisibleRects = function(e, n, o, i) {
				function s() {
					var S = kc(e, n);
					u.forEach(function(T) {
						0 > S.indexOf(T) && g(T);
					}), S.forEach(function(T) {
						0 > u.indexOf(T) && p(T);
					});
				}
				if (!xr) throw Error("Test selector API is not supported by this renderer.");
				var u = kc(e, n);
				o = zr(u, o, i);
				var f = o.disconnect, p = o.observe, g = o.unobserve;
				return bm.push(s), { disconnect: function() {
					var S = bm.indexOf(s);
					0 <= S && bm.splice(S, 1), f();
				} };
			}, le.shouldError = function(e) {
				return pu(e);
			}, le.shouldSuspend = function(e) {
				return fu(e);
			}, le.startHostTransition = function(e, n, o, i) {
				if (e.tag !== 5) throw Error("Expected the form instance to be a HostComponent. This is a bug in React.");
				var s = uf(e).queue;
				Hp(e), nt(e, s, n, Xt, o === null ? Em : function() {
					x.T === null && console.error("requestFormReset was called outside a transition or action. To fix, move to an action, or wrap with startTransition.");
					var u = uf(e);
					return u.next === null && (u = e.alternate.memoizedState), qi(e, u.next.queue, {}, Nt(e)), o(i);
				});
			}, le.updateContainer = function(e, n, o, i) {
				var s = n.current, u = Nt(s);
				return As(s, u, e, n, o, i), u;
			}, le.updateContainerSync = Wh, le;
		}, Tt.exports.default = Tt.exports, Object.defineProperty(Tt.exports, "__esModule", { value: !0 });
	}(Mg)), Mg.exports;
}
var Eb;
function n0() {
	return Eb || (Eb = 1, Rm.exports = e0()), Rm.exports;
}
var r0 = Xb(n0());
function createReconciler(config) {
	const reconciler = r0(config);
	reconciler.injectIntoDevTools();
	return reconciler;
}
var NoEventPriority = 0;
var catalogue = {};
var PREFIX_REGEX = /^three(?=[A-Z])/;
var toPascalCase = (type) => `${type[0].toUpperCase()}${type.slice(1)}`;
var i = 0;
var isConstructor = (object) => typeof object === "function";
function extend(objects) {
	if (isConstructor(objects)) {
		const Component = `${i++}`;
		catalogue[Component] = objects;
		return Component;
	} else Object.assign(catalogue, objects);
}
function validateInstance(type, props) {
	const name = toPascalCase(type);
	const target = catalogue[name];
	if (type !== "primitive" && !target) throw new Error(`R3F: ${name} is not part of the THREE namespace! Did you forget to extend? See: https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively`);
	if (type === "primitive" && !props.object) throw new Error(`R3F: Primitives without 'object' are invalid!`);
	if (props.args !== void 0 && !Array.isArray(props.args)) throw new Error("R3F: The args prop must be an array!");
}
function createInstance(type, props, root) {
	var _props$object;
	type = toPascalCase(type) in catalogue ? type : type.replace(PREFIX_REGEX, "");
	validateInstance(type, props);
	if (type === "primitive" && (_props$object = props.object) != null && _props$object.__r3f) delete props.object.__r3f;
	return prepare(props.object, root, type, props);
}
function hideInstance(instance) {
	if (!instance.isHidden) {
		var _instance$parent;
		if (instance.props.attach && (_instance$parent = instance.parent) != null && _instance$parent.object) detach(instance.parent, instance);
		else if (isObject3D(instance.object)) instance.object.visible = false;
		instance.isHidden = true;
		invalidateInstance(instance);
	}
}
function unhideInstance(instance) {
	if (instance.isHidden) {
		var _instance$parent2;
		if (instance.props.attach && (_instance$parent2 = instance.parent) != null && _instance$parent2.object) attach(instance.parent, instance);
		else if (isObject3D(instance.object) && instance.props.visible !== false) instance.object.visible = true;
		instance.isHidden = false;
		invalidateInstance(instance);
	}
}
function handleContainerEffects(parent, child, beforeChild) {
	const state = child.root.getState();
	if (!parent.parent && parent.object !== state.scene) return;
	if (!child.object) {
		var _child$props$object, _child$props$args;
		const target = catalogue[toPascalCase(child.type)];
		child.object = (_child$props$object = child.props.object) != null ? _child$props$object : new target(...(_child$props$args = child.props.args) != null ? _child$props$args : []);
		child.object.__r3f = child;
	}
	applyProps(child.object, child.props);
	if (child.props.attach) attach(parent, child);
	else if (isObject3D(child.object) && isObject3D(parent.object)) {
		const childIndex = parent.object.children.indexOf(beforeChild == null ? void 0 : beforeChild.object);
		if (beforeChild && childIndex !== -1) {
			const existingIndex = parent.object.children.indexOf(child.object);
			if (existingIndex !== -1) {
				parent.object.children.splice(existingIndex, 1);
				const adjustedIndex = existingIndex < childIndex ? childIndex - 1 : childIndex;
				parent.object.children.splice(adjustedIndex, 0, child.object);
			} else {
				child.object.parent = parent.object;
				parent.object.children.splice(childIndex, 0, child.object);
				child.object.dispatchEvent({ type: "added" });
				parent.object.dispatchEvent({
					type: "childadded",
					child: child.object
				});
			}
		} else parent.object.add(child.object);
	}
	for (const childInstance of child.children) handleContainerEffects(child, childInstance);
	invalidateInstance(child);
}
function appendChild(parent, child) {
	if (!child) return;
	child.parent = parent;
	parent.children.push(child);
	handleContainerEffects(parent, child);
}
function insertBefore(parent, child, beforeChild) {
	if (!child || !beforeChild) return;
	child.parent = parent;
	const childIndex = parent.children.indexOf(beforeChild);
	if (childIndex !== -1) parent.children.splice(childIndex, 0, child);
	else parent.children.push(child);
	handleContainerEffects(parent, child, beforeChild);
}
function disposeOnIdle(object) {
	if (typeof object.dispose === "function") {
		const handleDispose = () => {
			try {
				object.dispose();
			} catch {}
		};
		if (typeof IS_REACT_ACT_ENVIRONMENT !== "undefined") handleDispose();
		else (0, import_scheduler.unstable_scheduleCallback)(import_scheduler.unstable_IdlePriority, handleDispose);
	}
}
function removeChild(parent, child, dispose) {
	if (!child) return;
	child.parent = null;
	const childIndex = parent.children.indexOf(child);
	if (childIndex !== -1) parent.children.splice(childIndex, 1);
	if (child.props.attach) detach(parent, child);
	else if (isObject3D(child.object) && isObject3D(parent.object)) {
		parent.object.remove(child.object);
		removeInteractivity(findInitialRoot(child), child.object);
	}
	const shouldDispose = child.props.dispose !== null && dispose !== false;
	for (let i = child.children.length - 1; i >= 0; i--) {
		const node = child.children[i];
		removeChild(child, node, shouldDispose);
	}
	child.children.length = 0;
	delete child.object.__r3f;
	if (shouldDispose && child.type !== "primitive" && child.object.type !== "Scene") disposeOnIdle(child.object);
	if (dispose === void 0) invalidateInstance(child);
}
function setFiberRef(fiber, publicInstance) {
	for (const _fiber of [fiber, fiber.alternate]) if (_fiber !== null) {
		if (typeof _fiber.ref === "function") {
			_fiber.refCleanup == null || _fiber.refCleanup();
			const cleanup = _fiber.ref(publicInstance);
			if (typeof cleanup === "function") _fiber.refCleanup = cleanup;
		} else if (_fiber.ref) _fiber.ref.current = publicInstance;
	}
}
var reconstructed = [];
function swapInstances() {
	for (const [instance] of reconstructed) {
		const parent = instance.parent;
		if (parent) {
			if (instance.props.attach) detach(parent, instance);
			else if (isObject3D(instance.object) && isObject3D(parent.object)) parent.object.remove(instance.object);
			for (const child of instance.children) if (child.props.attach) detach(instance, child);
			else if (isObject3D(child.object) && isObject3D(instance.object)) instance.object.remove(child.object);
		}
		if (instance.isHidden) unhideInstance(instance);
		if (instance.object.__r3f) delete instance.object.__r3f;
		if (instance.type !== "primitive") disposeOnIdle(instance.object);
	}
	for (const [instance, props, fiber] of reconstructed) {
		instance.props = props;
		const parent = instance.parent;
		if (parent) {
			var _instance$props$objec, _instance$props$args;
			const target = catalogue[toPascalCase(instance.type)];
			instance.object = (_instance$props$objec = instance.props.object) != null ? _instance$props$objec : new target(...(_instance$props$args = instance.props.args) != null ? _instance$props$args : []);
			instance.object.__r3f = instance;
			setFiberRef(fiber, instance.object);
			applyProps(instance.object, instance.props);
			if (instance.props.attach) attach(parent, instance);
			else if (isObject3D(instance.object) && isObject3D(parent.object)) parent.object.add(instance.object);
			for (const child of instance.children) if (child.props.attach) attach(instance, child);
			else if (isObject3D(child.object) && isObject3D(instance.object)) instance.object.add(child.object);
			invalidateInstance(instance);
		}
	}
	reconstructed.length = 0;
}
var handleTextInstance = () => {};
var NO_CONTEXT = {};
var currentUpdatePriority = NoEventPriority;
var NoFlags = 0;
var Update = 4;
var reconciler = /* @__PURE__ */ createReconciler({
	isPrimaryRenderer: false,
	warnsIfNotActing: false,
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	createInstance,
	removeChild,
	appendChild,
	appendInitialChild: appendChild,
	insertBefore,
	appendChildToContainer(container, child) {
		const scene = container.getState().scene.__r3f;
		if (!child || !scene) return;
		appendChild(scene, child);
	},
	removeChildFromContainer(container, child) {
		const scene = container.getState().scene.__r3f;
		if (!child || !scene) return;
		removeChild(scene, child);
	},
	insertInContainerBefore(container, child, beforeChild) {
		const scene = container.getState().scene.__r3f;
		if (!child || !beforeChild || !scene) return;
		insertBefore(scene, child, beforeChild);
	},
	getRootHostContext: () => NO_CONTEXT,
	getChildHostContext: () => NO_CONTEXT,
	commitUpdate(instance, type, oldProps, newProps, fiber) {
		var _newProps$args, _oldProps$args, _newProps$args2;
		validateInstance(type, newProps);
		let reconstruct = false;
		if (instance.type === "primitive" && oldProps.object !== newProps.object) reconstruct = true;
		else if (((_newProps$args = newProps.args) == null ? void 0 : _newProps$args.length) !== ((_oldProps$args = oldProps.args) == null ? void 0 : _oldProps$args.length)) reconstruct = true;
		else if ((_newProps$args2 = newProps.args) != null && _newProps$args2.some((value, index) => {
			var _oldProps$args2;
			return value !== ((_oldProps$args2 = oldProps.args) == null ? void 0 : _oldProps$args2[index]);
		})) reconstruct = true;
		if (reconstruct) reconstructed.push([
			instance,
			{ ...newProps },
			fiber
		]);
		else {
			const changedProps = diffProps(instance, newProps);
			if (Object.keys(changedProps).length) {
				Object.assign(instance.props, changedProps);
				applyProps(instance.object, changedProps);
			}
		}
		if (fiber.sibling === null || (fiber.flags & Update) === NoFlags) swapInstances();
	},
	finalizeInitialChildren: () => false,
	commitMount() {},
	getPublicInstance: (instance) => instance == null ? void 0 : instance.object,
	prepareForCommit: () => null,
	preparePortalMount: (container) => prepare(container.getState().scene, container, "", {}),
	resetAfterCommit: () => {},
	shouldSetTextContent: () => false,
	clearContainer: () => false,
	hideInstance,
	unhideInstance,
	createTextInstance: handleTextInstance,
	hideTextInstance: handleTextInstance,
	unhideTextInstance: handleTextInstance,
	scheduleTimeout: typeof setTimeout === "function" ? setTimeout : void 0,
	cancelTimeout: typeof clearTimeout === "function" ? clearTimeout : void 0,
	noTimeout: -1,
	getInstanceFromNode: () => null,
	beforeActiveInstanceBlur() {},
	afterActiveInstanceBlur() {},
	detachDeletedInstance() {},
	prepareScopeUpdate() {},
	getInstanceFromScope: () => null,
	shouldAttemptEagerTransition: () => false,
	trackSchedulerEvent: () => {},
	resolveEventType: () => null,
	resolveEventTimeStamp: () => -1.1,
	requestPostPaintCallback() {},
	maySuspendCommit: () => false,
	preloadInstance: () => true,
	suspendInstance() {},
	waitForCommitToBeReady: () => null,
	NotPendingTransition: null,
	HostTransitionContext: /* @__PURE__ */ import_react.createContext(null),
	setCurrentUpdatePriority(newPriority) {
		currentUpdatePriority = newPriority;
	},
	getCurrentUpdatePriority() {
		return currentUpdatePriority;
	},
	resolveUpdatePriority() {
		var _window$event;
		if (currentUpdatePriority !== NoEventPriority) return currentUpdatePriority;
		switch (typeof window !== "undefined" && ((_window$event = window.event) == null ? void 0 : _window$event.type)) {
			case "click":
			case "contextmenu":
			case "dblclick":
			case "pointercancel":
			case "pointerdown":
			case "pointerup": return e;
			case "pointermove":
			case "pointerout":
			case "pointerover":
			case "pointerenter":
			case "pointerleave":
			case "wheel": return o;
			default: return r;
		}
	},
	resetFormInstance() {},
	rendererPackageName: "@react-three/fiber",
	rendererVersion: packageData.version,
	applyViewTransitionName(_instance, _name, _className) {},
	restoreViewTransitionName(_instance, _props) {},
	cancelViewTransitionName(_instance, _name, _props) {},
	cancelRootViewTransitionName(_rootContainer) {},
	restoreRootViewTransitionName(_rootContainer) {},
	InstanceMeasurement: null,
	measureInstance: (_instance) => null,
	wasInstanceInViewport: (_measurement) => true,
	hasInstanceChanged: (_oldMeasurement, _newMeasurement) => false,
	hasInstanceAffectedParent: (_oldMeasurement, _newMeasurement) => false,
	suspendOnActiveViewTransition(_state, _container) {},
	startGestureTransition: () => null,
	startViewTransition: () => null,
	stopViewTransition(_transition) {},
	createViewTransitionInstance: (_name) => null,
	getCurrentGestureOffset(_provider) {
		throw new Error("startGestureTransition is not yet supported in react-three-fiber.");
	},
	cloneMutableInstance(instance, _keepChildren) {
		return instance;
	},
	cloneMutableTextInstance(textInstance) {
		return textInstance;
	},
	cloneRootViewTransitionContainer(_rootContainer) {
		throw new Error("Not implemented.");
	},
	removeRootViewTransitionClone(_rootContainer, _clone) {
		throw new Error("Not implemented.");
	},
	createFragmentInstance: (_fiber) => null,
	updateFragmentInstanceFiber(_fiber, _instance) {},
	commitNewChildToFragmentInstance(_child, _fragmentInstance) {},
	deleteChildFromFragmentInstance(_child, _fragmentInstance) {},
	measureClonedInstance: (_instance) => null,
	maySuspendCommitOnUpdate: (_type, _oldProps, _newProps) => false,
	maySuspendCommitInSyncRender: (_type, _props) => false,
	startSuspendingCommit: () => null,
	getSuspendedCommitReason: (_state, _rootContainer) => null
});
var _roots = /* @__PURE__ */ new Map();
var shallowLoose = {
	objects: "shallow",
	strict: false
};
function computeInitialSize(canvas, size) {
	if (!size && typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement && canvas.parentElement) {
		const { width, height, top, left } = canvas.parentElement.getBoundingClientRect();
		return {
			width,
			height,
			top,
			left
		};
	} else if (!size && typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) return {
		width: canvas.width,
		height: canvas.height,
		top: 0,
		left: 0
	};
	return {
		width: 0,
		height: 0,
		top: 0,
		left: 0,
		...size
	};
}
function createRoot(canvas) {
	const prevRoot = _roots.get(canvas);
	const prevFiber = prevRoot == null ? void 0 : prevRoot.fiber;
	const prevStore = prevRoot == null ? void 0 : prevRoot.store;
	if (prevRoot) console.warn("R3F.createRoot should only be called once!");
	const logRecoverableError = typeof reportError === "function" ? reportError : console.error;
	const store = prevStore || createStore(invalidate, advance);
	const fiber = prevFiber || reconciler.createContainer(store, t, null, false, null, "", logRecoverableError, logRecoverableError, logRecoverableError, null);
	if (!prevRoot) _roots.set(canvas, {
		fiber,
		store
	});
	let onCreated;
	let lastCamera;
	let configured = false;
	let pending = null;
	return {
		async configure(props = {}) {
			let resolve;
			pending = new Promise((_resolve) => resolve = _resolve);
			let { gl: glConfig, size: propsSize, scene: sceneOptions, events, onCreated: onCreatedCallback, shadows = false, linear = false, flat = false, legacy = false, orthographic = false, frameloop = "always", dpr = [1, 2], performance, raycaster: raycastOptions, camera: cameraOptions, onPointerMissed } = props;
			let state = store.getState();
			let gl = state.gl;
			if (!state.gl) {
				const defaultProps = {
					canvas,
					powerPreference: "high-performance",
					antialias: true,
					alpha: true
				};
				const customRenderer = typeof glConfig === "function" ? await glConfig(defaultProps) : glConfig;
				if (isRenderer(customRenderer)) gl = customRenderer;
				else gl = new WebGLRenderer({
					...defaultProps,
					...glConfig
				});
				state.set({ gl });
			}
			let raycaster = state.raycaster;
			if (!raycaster) state.set({ raycaster: raycaster = new Raycaster() });
			const { params, ...options } = raycastOptions || {};
			if (!is.equ(options, raycaster, shallowLoose)) applyProps(raycaster, { ...options });
			if (!is.equ(params, raycaster.params, shallowLoose)) applyProps(raycaster, { params: {
				...raycaster.params,
				...params
			} });
			if (!state.camera || state.camera === lastCamera && !is.equ(lastCamera, cameraOptions, shallowLoose)) {
				lastCamera = cameraOptions;
				const isCamera = cameraOptions == null ? void 0 : cameraOptions.isCamera;
				const camera = isCamera ? cameraOptions : orthographic ? new OrthographicCamera(0, 0, 0, 0, .1, 1e3) : new PerspectiveCamera(75, 0, .1, 1e3);
				if (!isCamera) {
					camera.position.z = 5;
					if (cameraOptions) {
						applyProps(camera, cameraOptions);
						if (!camera.manual) {
							if ("aspect" in cameraOptions || "left" in cameraOptions || "right" in cameraOptions || "bottom" in cameraOptions || "top" in cameraOptions) {
								camera.manual = true;
								camera.updateProjectionMatrix();
							}
						}
					}
					if (!state.camera && !(cameraOptions != null && cameraOptions.rotation)) camera.lookAt(0, 0, 0);
				}
				state.set({ camera });
				raycaster.camera = camera;
			}
			if (!state.scene) {
				let scene;
				if (sceneOptions != null && sceneOptions.isScene) {
					scene = sceneOptions;
					prepare(scene, store, "", {});
				} else {
					scene = new Scene();
					prepare(scene, store, "", {});
					if (sceneOptions) applyProps(scene, sceneOptions);
				}
				state.set({ scene });
			}
			if (events && !state.events.handlers) state.set({ events: events(store) });
			const size = computeInitialSize(canvas, propsSize);
			if (!is.equ(size, state.size, shallowLoose)) state.setSize(size.width, size.height, size.top, size.left);
			if (dpr && state.viewport.dpr !== calculateDpr(dpr)) state.setDpr(dpr);
			if (state.frameloop !== frameloop) state.setFrameloop(frameloop);
			if (!state.onPointerMissed) state.set({ onPointerMissed });
			if (performance && !is.equ(performance, state.performance, shallowLoose)) state.set((state) => ({ performance: {
				...state.performance,
				...performance
			} }));
			if (!state.xr) {
				var _gl$xr;
				const handleXRFrame = (timestamp, frame) => {
					const state = store.getState();
					if (state.frameloop === "never") return;
					advance(timestamp, true, state, frame);
				};
				const handleSessionChange = () => {
					const state = store.getState();
					state.gl.xr.enabled = state.gl.xr.isPresenting;
					state.gl.xr.setAnimationLoop(state.gl.xr.isPresenting ? handleXRFrame : null);
					if (!state.gl.xr.isPresenting) invalidate(state);
				};
				const xr = {
					connect() {
						const gl = store.getState().gl;
						gl.xr.addEventListener("sessionstart", handleSessionChange);
						gl.xr.addEventListener("sessionend", handleSessionChange);
					},
					disconnect() {
						const gl = store.getState().gl;
						gl.xr.removeEventListener("sessionstart", handleSessionChange);
						gl.xr.removeEventListener("sessionend", handleSessionChange);
					}
				};
				if (typeof ((_gl$xr = gl.xr) == null ? void 0 : _gl$xr.addEventListener) === "function") xr.connect();
				state.set({ xr });
			}
			if (gl.shadowMap) {
				const oldEnabled = gl.shadowMap.enabled;
				const oldType = gl.shadowMap.type;
				gl.shadowMap.enabled = !!shadows;
				if (is.boo(shadows)) gl.shadowMap.type = 2;
				else if (is.str(shadows)) {
					var _types$shadows;
					const types = {
						basic: 0,
						percentage: 1,
						soft: 2,
						variance: 3
					};
					gl.shadowMap.type = (_types$shadows = types[shadows]) != null ? _types$shadows : 2;
				} else if (is.obj(shadows)) Object.assign(gl.shadowMap, shadows);
				if (oldEnabled !== gl.shadowMap.enabled || oldType !== gl.shadowMap.type) gl.shadowMap.needsUpdate = true;
			}
			ColorManagement.enabled = !legacy;
			if (!configured) {
				gl.outputColorSpace = linear ? LinearSRGBColorSpace : SRGBColorSpace;
				gl.toneMapping = flat ? 0 : 4;
			}
			if (state.legacy !== legacy) state.set(() => ({ legacy }));
			if (state.linear !== linear) state.set(() => ({ linear }));
			if (state.flat !== flat) state.set(() => ({ flat }));
			if (glConfig && !is.fun(glConfig) && !isRenderer(glConfig) && !is.equ(glConfig, gl, shallowLoose)) applyProps(gl, glConfig);
			onCreated = onCreatedCallback;
			configured = true;
			resolve();
			return this;
		},
		render(children) {
			if (!configured && !pending) this.configure();
			pending.then(() => {
				reconciler.updateContainer(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Provider, {
					store,
					children,
					onCreated,
					rootElement: canvas
				}), fiber, null, () => void 0);
			});
			return store;
		},
		unmount() {
			unmountComponentAtNode(canvas);
		}
	};
}
function Provider({ store, children, onCreated, rootElement }) {
	useIsomorphicLayoutEffect(() => {
		const state = store.getState();
		state.set((state) => ({ internal: {
			...state.internal,
			active: true
		} }));
		if (onCreated) onCreated(state);
		if (!store.getState().events.connected) state.events.connect == null || state.events.connect(rootElement);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(context.Provider, {
		value: store,
		children
	});
}
function unmountComponentAtNode(canvas, callback) {
	const root = _roots.get(canvas);
	const fiber = root == null ? void 0 : root.fiber;
	if (fiber) {
		const state = root == null ? void 0 : root.store.getState();
		if (state) state.internal.active = false;
		reconciler.updateContainer(null, fiber, null, () => {
			if (state) setTimeout(() => {
				try {
					var _state$gl, _state$gl$renderLists, _state$gl2, _state$gl3;
					state.events.disconnect == null || state.events.disconnect();
					(_state$gl = state.gl) == null || (_state$gl$renderLists = _state$gl.renderLists) == null || _state$gl$renderLists.dispose == null || _state$gl$renderLists.dispose();
					(_state$gl2 = state.gl) == null || _state$gl2.forceContextLoss == null || _state$gl2.forceContextLoss();
					if ((_state$gl3 = state.gl) != null && _state$gl3.xr) state.xr.disconnect();
					dispose(state.scene);
					_roots.delete(canvas);
					if (callback) callback(canvas);
				} catch (e) {}
			}, 500);
		});
	}
}
function createPortal(children, container, state) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, {
		children,
		container,
		state
	});
}
function Portal({ state = {}, children, container }) {
	/** This has to be a component because it would not be able to call useThree/useStore otherwise since
	*  if this is our environment, then we are not in r3f's renderer but in react-dom, it would trigger
	*  the "R3F hooks can only be used within the Canvas component!" warning:
	*  <Canvas>
	*    {createPortal(...)} */
	const { events, size, ...rest } = state;
	const previousRoot = useStore();
	const [raycaster] = import_react.useState(() => new Raycaster());
	const [pointer] = import_react.useState(() => new Vector2());
	const inject = useMutableCallback((rootState, injectState) => {
		let viewport = void 0;
		if (injectState.camera && size) {
			const camera = injectState.camera;
			viewport = rootState.viewport.getCurrentViewport(camera, new Vector3(), size);
			if (camera !== rootState.camera) updateCamera(camera, size);
		}
		return {
			...rootState,
			...injectState,
			scene: container,
			raycaster,
			pointer,
			mouse: pointer,
			previousRoot,
			events: {
				...rootState.events,
				...injectState.events,
				...events
			},
			size: {
				...rootState.size,
				...size
			},
			viewport: {
				...rootState.viewport,
				...viewport
			},
			setEvents: (events) => injectState.set((state) => ({
				...state,
				events: {
					...state.events,
					...events
				}
			}))
		};
	});
	const usePortalStore = import_react.useMemo(() => {
		const store = createWithEqualityFn((set, get) => ({
			...rest,
			set,
			get
		}));
		const onMutate = (prev) => store.setState((state) => inject.current(prev, state));
		onMutate(previousRoot.getState());
		previousRoot.subscribe(onMutate);
		return store;
	}, [previousRoot, container]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: reconciler.createPortal(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(context.Provider, {
		value: usePortalStore,
		children
	}), usePortalStore, null) });
}
/**
* Force React to flush any updates inside the provided callback synchronously and immediately.
* All the same caveats documented for react-dom's `flushSync` apply here (see https://react.dev/reference/react-dom/flushSync).
* Nevertheless, sometimes one needs to render synchronously, for example to keep DOM and 3D changes in lock-step without
* having to revert to a non-React solution. Note: this will only flush updates within the `Canvas` root.
*/
function flushSync(fn) {
	return reconciler.flushSyncFromReconciler(fn);
}
function createSubs(callback, subs) {
	const sub = { callback };
	subs.add(sub);
	return () => void subs.delete(sub);
}
var globalEffects = /* @__PURE__ */ new Set();
var globalAfterEffects = /* @__PURE__ */ new Set();
var globalTailEffects = /* @__PURE__ */ new Set();
/**
* Adds a global render callback which is called each frame.
* @see https://docs.pmnd.rs/react-three-fiber/api/additional-exports#addEffect
*/
var addEffect = (callback) => createSubs(callback, globalEffects);
/**
* Adds a global after-render callback which is called each frame.
* @see https://docs.pmnd.rs/react-three-fiber/api/additional-exports#addAfterEffect
*/
var addAfterEffect = (callback) => createSubs(callback, globalAfterEffects);
/**
* Adds a global callback which is called when rendering stops.
* @see https://docs.pmnd.rs/react-three-fiber/api/additional-exports#addTail
*/
var addTail = (callback) => createSubs(callback, globalTailEffects);
function run(effects, timestamp) {
	if (!effects.size) return;
	for (const { callback } of effects.values()) callback(timestamp);
}
function flushGlobalEffects(type, timestamp) {
	switch (type) {
		case "before": return run(globalEffects, timestamp);
		case "after": return run(globalAfterEffects, timestamp);
		case "tail": return run(globalTailEffects, timestamp);
	}
}
var subscribers;
var subscription;
function update(timestamp, state, frame) {
	let delta = state.clock.getDelta();
	if (state.frameloop === "never" && typeof timestamp === "number") {
		delta = timestamp - state.clock.elapsedTime;
		state.clock.oldTime = state.clock.elapsedTime;
		state.clock.elapsedTime = timestamp;
	}
	subscribers = state.internal.subscribers;
	for (let i = 0; i < subscribers.length; i++) {
		subscription = subscribers[i];
		subscription.ref.current(subscription.store.getState(), delta, frame);
	}
	if (!state.internal.priority && state.gl.render) state.gl.render(state.scene, state.camera);
	state.internal.frames = Math.max(0, state.internal.frames - 1);
	return state.frameloop === "always" ? 1 : state.internal.frames;
}
var running = false;
var useFrameInProgress = false;
var repeat;
var frame;
var state;
function loop(timestamp) {
	frame = requestAnimationFrame(loop);
	running = true;
	repeat = 0;
	flushGlobalEffects("before", timestamp);
	useFrameInProgress = true;
	for (const root of _roots.values()) {
		var _state$gl$xr;
		state = root.store.getState();
		if (state.internal.active && (state.frameloop === "always" || state.internal.frames > 0) && !((_state$gl$xr = state.gl.xr) != null && _state$gl$xr.isPresenting)) repeat += update(timestamp, state);
	}
	useFrameInProgress = false;
	flushGlobalEffects("after", timestamp);
	if (repeat === 0) {
		flushGlobalEffects("tail", timestamp);
		running = false;
		return cancelAnimationFrame(frame);
	}
}
/**
* Invalidates the view, requesting a frame to be rendered. Will globally invalidate unless passed a root's state.
* @see https://docs.pmnd.rs/react-three-fiber/api/additional-exports#invalidate
*/
function invalidate(state, frames = 1) {
	var _state$gl$xr2;
	if (!state) return _roots.forEach((root) => invalidate(root.store.getState(), frames));
	if ((_state$gl$xr2 = state.gl.xr) != null && _state$gl$xr2.isPresenting || !state.internal.active || state.frameloop === "never") return;
	if (frames > 1) state.internal.frames = Math.min(60, state.internal.frames + frames);
	else if (useFrameInProgress) state.internal.frames = 2;
	else state.internal.frames = 1;
	if (!running) {
		running = true;
		requestAnimationFrame(loop);
	}
}
/**
* Advances the frameloop and runs render effects, useful for when manually rendering via `frameloop="never"`.
* @see https://docs.pmnd.rs/react-three-fiber/api/additional-exports#advance
*/
function advance(timestamp, runGlobalEffects = true, state, frame) {
	if (runGlobalEffects) flushGlobalEffects("before", timestamp);
	if (!state) for (const root of _roots.values()) update(timestamp, root.store.getState());
	else update(timestamp, state, frame);
	if (runGlobalEffects) flushGlobalEffects("after", timestamp);
}
var DOM_EVENTS = {
	onClick: ["click", false],
	onContextMenu: ["contextmenu", false],
	onDoubleClick: ["dblclick", false],
	onWheel: ["wheel", true],
	onPointerDown: ["pointerdown", true],
	onPointerUp: ["pointerup", true],
	onPointerLeave: ["pointerleave", true],
	onPointerMove: ["pointermove", true],
	onPointerCancel: ["pointercancel", true],
	onLostPointerCapture: ["lostpointercapture", true]
};
/** Default R3F event manager for web */
function createPointerEvents(store) {
	const { handlePointer } = createEvents(store);
	return {
		priority: 1,
		enabled: true,
		compute(event, state, previous) {
			state.pointer.set(event.offsetX / state.size.width * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
			state.raycaster.setFromCamera(state.pointer, state.camera);
		},
		connected: void 0,
		handlers: Object.keys(DOM_EVENTS).reduce((acc, key) => ({
			...acc,
			[key]: handlePointer(key)
		}), {}),
		update: () => {
			var _internal$lastEvent;
			const { events, internal } = store.getState();
			if ((_internal$lastEvent = internal.lastEvent) != null && _internal$lastEvent.current && events.handlers) events.handlers.onPointerMove(internal.lastEvent.current);
		},
		connect: (target) => {
			const { set, events } = store.getState();
			events.disconnect == null || events.disconnect();
			set((state) => ({ events: {
				...state.events,
				connected: target
			} }));
			if (events.handlers) for (const name in events.handlers) {
				const event = events.handlers[name];
				const [eventName, passive] = DOM_EVENTS[name];
				target.addEventListener(eventName, event, { passive });
			}
		},
		disconnect: () => {
			const { set, events } = store.getState();
			if (events.connected) {
				if (events.handlers) for (const name in events.handlers) {
					const event = events.handlers[name];
					const [eventName] = DOM_EVENTS[name];
					events.connected.removeEventListener(eventName, event);
				}
				set((state) => ({ events: {
					...state.events,
					connected: void 0
				} }));
			}
		}
	};
}
//#endregion
//#region node_modules/react-use-measure/dist/index.js
function g(n, t) {
	let o;
	return (...i) => {
		window.clearTimeout(o), o = window.setTimeout(() => n(...i), t);
	};
}
function j({ debounce: n, scroll: t, polyfill: o, offsetSize: i } = {
	debounce: 0,
	scroll: !1,
	offsetSize: !1
}) {
	const a = o || (typeof window == "undefined" ? class {} : window.ResizeObserver);
	if (!a) throw new Error("This browser does not support ResizeObserver out of the box. See: https://github.com/react-spring/react-use-measure/#resize-observer-polyfills");
	const [c, h] = (0, import_react.useState)({
		left: 0,
		top: 0,
		width: 0,
		height: 0,
		bottom: 0,
		right: 0,
		x: 0,
		y: 0
	}), e = (0, import_react.useRef)({
		element: null,
		scrollContainers: null,
		resizeObserver: null,
		lastBounds: c,
		orientationHandler: null
	}), d = n ? typeof n == "number" ? n : n.scroll : null, f = n ? typeof n == "number" ? n : n.resize : null, w = (0, import_react.useRef)(!1);
	(0, import_react.useEffect)(() => (w.current = !0, () => void (w.current = !1)));
	const [z, m, s] = (0, import_react.useMemo)(() => {
		const r = () => {
			if (!e.current.element) return;
			const { left: y, top: C, width: H, height: O, bottom: S, right: x, x: B, y: R } = e.current.element.getBoundingClientRect(), l = {
				left: y,
				top: C,
				width: H,
				height: O,
				bottom: S,
				right: x,
				x: B,
				y: R
			};
			e.current.element instanceof HTMLElement && i && (l.height = e.current.element.offsetHeight, l.width = e.current.element.offsetWidth), Object.freeze(l), w.current && !D(e.current.lastBounds, l) && h(e.current.lastBounds = l);
		};
		return [
			r,
			f ? g(r, f) : r,
			d ? g(r, d) : r
		];
	}, [
		h,
		i,
		d,
		f
	]);
	function v() {
		e.current.scrollContainers && (e.current.scrollContainers.forEach((r) => r.removeEventListener("scroll", s, !0)), e.current.scrollContainers = null), e.current.resizeObserver && (e.current.resizeObserver.disconnect(), e.current.resizeObserver = null), e.current.orientationHandler && ("orientation" in screen && "removeEventListener" in screen.orientation ? screen.orientation.removeEventListener("change", e.current.orientationHandler) : "onorientationchange" in window && window.removeEventListener("orientationchange", e.current.orientationHandler));
	}
	function b() {
		e.current.element && (e.current.resizeObserver = new a(s), e.current.resizeObserver.observe(e.current.element), t && e.current.scrollContainers && e.current.scrollContainers.forEach((r) => r.addEventListener("scroll", s, {
			capture: !0,
			passive: !0
		})), e.current.orientationHandler = () => {
			s();
		}, "orientation" in screen && "addEventListener" in screen.orientation ? screen.orientation.addEventListener("change", e.current.orientationHandler) : "onorientationchange" in window && window.addEventListener("orientationchange", e.current.orientationHandler));
	}
	const L = (r) => {
		!r || r === e.current.element || (v(), e.current.element = r, e.current.scrollContainers = E(r), b());
	};
	return X(s, !!t), W(m), (0, import_react.useEffect)(() => {
		v(), b();
	}, [
		t,
		s,
		m
	]), (0, import_react.useEffect)(() => v, []), [
		L,
		c,
		z
	];
}
function W(n) {
	(0, import_react.useEffect)(() => {
		const t = n;
		return window.addEventListener("resize", t), () => void window.removeEventListener("resize", t);
	}, [n]);
}
function X(n, t) {
	(0, import_react.useEffect)(() => {
		if (t) {
			const o = n;
			return window.addEventListener("scroll", o, {
				capture: !0,
				passive: !0
			}), () => void window.removeEventListener("scroll", o, !0);
		}
	}, [n, t]);
}
function E(n) {
	const t = [];
	if (!n || n === document.body) return t;
	const { overflow: o, overflowX: i, overflowY: a } = window.getComputedStyle(n);
	return [
		o,
		i,
		a
	].some((c) => c === "auto" || c === "scroll") && t.push(n), [...t, ...E(n.parentElement)];
}
var k = [
	"x",
	"y",
	"top",
	"bottom",
	"left",
	"right",
	"width",
	"height"
], D = (n, t) => k.every((o) => n[o] === t[o]);
//#endregion
//#region node_modules/@react-three/fiber/dist/react-three-fiber.esm.js
function CanvasImpl({ ref, children, fallback, resize, style, gl, events = createPointerEvents, eventSource, eventPrefix, shadows, linear, flat, legacy, orthographic, frameloop, dpr, performance, raycaster, camera, scene, onPointerMissed, onCreated, ...props }) {
	import_react.useMemo(() => extend(three_module_exports), []);
	const Bridge = useBridge();
	const [containerRef, containerRect] = j({
		scroll: true,
		debounce: {
			scroll: 50,
			resize: 0
		},
		...resize
	});
	const canvasRef = import_react.useRef(null);
	const divRef = import_react.useRef(null);
	import_react.useImperativeHandle(ref, () => canvasRef.current);
	const handlePointerMissed = useMutableCallback(onPointerMissed);
	const [block, setBlock] = import_react.useState(false);
	const [error, setError] = import_react.useState(false);
	if (block) throw block;
	if (error) throw error;
	const root = import_react.useRef(null);
	useIsomorphicLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (containerRect.width > 0 && containerRect.height > 0 && canvas) {
			if (!root.current) root.current = createRoot(canvas);
			async function run() {
				await root.current.configure({
					gl,
					scene,
					events,
					shadows,
					linear,
					flat,
					legacy,
					orthographic,
					frameloop,
					dpr,
					performance,
					raycaster,
					camera,
					size: containerRect,
					onPointerMissed: (...args) => handlePointerMissed.current == null ? void 0 : handlePointerMissed.current(...args),
					onCreated: (state) => {
						state.events.connect == null || state.events.connect(eventSource ? isRef(eventSource) ? eventSource.current : eventSource : divRef.current);
						if (eventPrefix) state.setEvents({ compute: (event, state) => {
							const x = event[eventPrefix + "X"];
							const y = event[eventPrefix + "Y"];
							state.pointer.set(x / state.size.width * 2 - 1, -(y / state.size.height) * 2 + 1);
							state.raycaster.setFromCamera(state.pointer, state.camera);
						} });
						onCreated?.(state);
					}
				});
				root.current.render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bridge, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorBoundary, {
					set: setError,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
						fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Block, { set: setBlock }),
						children: children != null ? children : null
					})
				}) }));
			}
			run();
		}
	});
	import_react.useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas) return () => unmountComponentAtNode(canvas);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: divRef,
		style: {
			position: "relative",
			width: "100%",
			height: "100%",
			overflow: "hidden",
			pointerEvents: eventSource ? "none" : "auto",
			...style
		},
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref: containerRef,
			style: {
				width: "100%",
				height: "100%"
			},
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
				ref: canvasRef,
				style: { display: "block" },
				children: fallback
			})
		})
	});
}
/**
* A DOM canvas which accepts threejs elements as children.
* @see https://docs.pmnd.rs/react-three-fiber/api/canvas
*/
function Canvas(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(m, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CanvasImpl, { ...props }) });
}
//#endregion
export { unmountComponentAtNode as C, useLoader as D, useInstanceHandle as E, useStore as O, threeTypes as S, useGraph as T, flushGlobalEffects as _, addEffect as a, invalidate as b, applyProps as c, createEvents as d, createPointerEvents as f, extend as g, dispose as h, addAfterEffect as i, useThree as k, buildGraph as l, createRoot as m, _roots as n, addTail as o, createPortal as p, act as r, advance as s, Canvas as t, context as u, flushSync as v, useFrame as w, reconciler as x, getRootState as y };

//# sourceMappingURL=react-three-fiber.esm-GDPJ0UiV.js.map