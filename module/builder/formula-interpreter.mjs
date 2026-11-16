/**
 * SBE — Interpréteur de formules
 *
 * Les formules du MJ sont lues et calculées ici, sans jamais passer par
 * le moteur JavaScript du navigateur (pas de `new Function`, pas
 * d'`eval`) : une formule ne peut RIEN faire d'autre que calculer avec
 * ce qu'on lui donne. Un modèle partagé par quelqu'un d'autre ne peut
 * donc pas exécuter de code chez le MJ ou les joueurs.
 *
 * Ce qu'une formule sait écrire (la syntaxe des expressions JavaScript,
 * sans affectation ni fonction fléchée) :
 *   nombres, textes ("…" ou '…'), true / false / null / undefined ;
 *   les clés de la portée, les fonctions de formule, Math, Number,
 *   String, Boolean, parseInt, parseFloat, isNaN, isFinite, NaN, Infinity ;
 *   + - * / % **, comparaisons (< <= > >= == != === !==), ! && || ??,
 *   bits (& | ^ ~ << >> >>>), a ? b : c, parenthèses ;
 *   appels de fonction (arguments séparés par « , » ou « ; »), accès a.b,
 *   a?.b, a[i] ;
 *   quelques méthodes sûres des textes, des listes et des nombres.
 *
 * Interdits : `new`, affectations, fonctions, et l'accès aux propriétés
 * internes (constructor, __proto__, prototype…). Seuls les objets
 * simples, les listes, les textes, les nombres et Math se lisent.
 */

/* ------------------------------------------------------------ */
/*  Ce que les formules peuvent atteindre                        */
/* ------------------------------------------------------------ */

const SAFE_GLOBALS = Object.freeze({
  Math, Number, String, Boolean, parseInt, parseFloat, isNaN, isFinite,
  NaN, Infinity, undefined
});

/* Méthodes permises, par sorte de valeur. */
const STRING_METHODS = new Set(["includes", "startsWith", "endsWith", "toLowerCase", "toUpperCase", "trim", "trimStart",
  "trimEnd", "slice", "substring", "indexOf", "lastIndexOf", "padStart", "padEnd", "repeat", "split", "charAt", "at",
  "concat", "replace", "replaceAll", "localeCompare", "normalize", "toString"]);
const ARRAY_METHODS = new Set(["includes", "indexOf", "lastIndexOf", "join", "slice", "at", "concat", "toString"]);
const NUMBER_METHODS = new Set(["toFixed", "toPrecision", "toString"]);
/* Number.xxx et String.xxx : seulement les fonctions de lecture. */
const NUMBER_STATICS = new Set(["isInteger", "isFinite", "isNaN", "isSafeInteger", "parseFloat", "parseInt",
  "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "EPSILON", "MAX_VALUE", "MIN_VALUE", "POSITIVE_INFINITY", "NEGATIVE_INFINITY"]);
const STRING_STATICS = new Set(["fromCharCode"]);

/* Jamais lues, quelle que soit la valeur. */
const BLOCKED_PROPS = new Set(["constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__",
  "__lookupGetter__", "__lookupSetter__", "caller", "callee", "arguments", "call", "apply", "bind"]);

/* Garde-fous de taille. */
const MAX_SRC = 4000;
const MAX_DEPTH = 120;
const MAX_STRING = 100000;
const CACHE_MAX = 3000;

export class FormulaError extends Error {}

/* ------------------------------------------------------------ */
/*  Lecture (découpage en mots)                                  */
/* ------------------------------------------------------------ */

const PUNCT = ["===", "!==", ">>>", "**", "??", "?.", "==", "!=", "<=", ">=", "&&", "||", "<<", ">>",
  "<", ">", "+", "-", "*", "/", "%", "!", "~", "&", "|", "^", "?", ":", "(", ")", "[", "]", ",", ";", "."];
const ESCAPES = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    /* Nombre : 12, 1.5, .5, 1e3 */
    const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]), at: i }); i += num[0].length; continue; }
    if (c === '"' || c === "'") {
      let s = "";
      let j = i + 1;
      for (; j < src.length && src[j] !== c; j++) {
        if (src[j] === "\\") {
          const n = src[++j];
          if (n === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 1, j + 5))) { s += String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16)); j += 4; }
          else s += ESCAPES[n] ?? n ?? "";
        } else s += src[j];
      }
      if (j >= src.length) throw new FormulaError(`unterminated string at ${i + 1}`);
      out.push({ t: "str", v: s, at: i });
      i = j + 1;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0], at: i }); i += id[0].length; continue; }
    const p = PUNCT.find(op => src.startsWith(op, i));
    /* « ?. » suivi d'un chiffre est « ? .5 » (une condition). */
    if (p === "?." && /\d/.test(src[i + 2] ?? "")) { out.push({ t: "p", v: "?", at: i }); i += 1; continue; }
    if (p) { out.push({ t: "p", v: p, at: i }); i += p.length; continue; }
    throw new FormulaError(`unexpected character "${c}" at ${i + 1}`);
  }
  out.push({ t: "end", at: src.length });
  return out;
}

/* ------------------------------------------------------------ */
/*  Analyse (arbre)                                              */
/* ------------------------------------------------------------ */

/* Priorités des opérateurs à deux termes (comme JavaScript). */
const BINARY = {
  "??": 1, "||": 2, "&&": 3, "|": 4, "^": 5, "&": 6,
  "==": 7, "!=": 7, "===": 7, "!==": 7,
  "<": 8, "<=": 8, ">": 8, ">=": 8,
  "<<": 9, ">>": 9, ">>>": 9,
  "+": 10, "-": 10, "*": 11, "/": 11, "%": 11, "**": 12
};
const UNARY = new Set(["!", "-", "+", "~"]);

function parse(src) {
  const toks = tokenize(src);
  let k = 0;
  let depth = 0;
  const peek = () => toks[k];
  const next = () => toks[k++];
  const is = (v) => toks[k].t === "p" && toks[k].v === v;
  const expect = (v) => {
    if (!is(v)) throw new FormulaError(`"${v}" expected at ${toks[k].at + 1}`);
    return next();
  };
  const deeper = () => { if (++depth > MAX_DEPTH) throw new FormulaError("formula too deeply nested"); };

  function expression() {
    deeper();
    const test = binary(0);
    let out = test;
    if (is("?")) {
      next();
      const yes = expression();
      expect(":");
      const no = expression();
      out = { k: "if", test, yes, no };
    }
    depth--;
    return out;
  }

  function binary(min) {
    let left = unary();
    for (;;) {
      const t = peek();
      const prec = t.t === "p" ? BINARY[t.v] : undefined;
      if (prec === undefined || prec <= min) break;
      next();
      /* ** se lit de droite à gauche, le reste de gauche à droite. */
      const right = binary(t.v === "**" ? prec - 1 : prec);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }

  function unary() {
    const t = peek();
    if (t.t === "p" && UNARY.has(t.v)) {
      next();
      deeper();
      const arg = unary();
      depth--;
      /* -2 ** 2 est refusé par JavaScript : idem ici. */
      if (is("**")) throw new FormulaError("parenthesize unary operand before **");
      return { k: "un", op: t.v, a: arg };
    }
    return postfix(primary());
  }

  function args() {
    const list = [];
    if (!is(")")) {
      for (;;) {
        list.push(expression());
        /* « ; » sépare aussi les arguments : table("paliers"; force; "bonus"). */
        if (is(",") || is(";")) { next(); if (is(")")) break; continue; }
        break;
      }
    }
    expect(")");
    return list;
  }

  function postfix(node) {
    for (;;) {
      if (is(".")) {
        next();
        const n = next();
        if (n.t !== "id") throw new FormulaError(`property name expected at ${n.at + 1}`);
        node = { k: "get", o: node, p: { k: "lit", v: n.v }, opt: false };
      } else if (is("?.")) {
        next();
        if (is("(")) { next(); node = { k: "call", f: node, args: args(), opt: true }; continue; }
        if (is("[")) { next(); const p = expression(); expect("]"); node = { k: "get", o: node, p, opt: true }; continue; }
        const n = next();
        if (n.t !== "id") throw new FormulaError(`property name expected at ${n.at + 1}`);
        node = { k: "get", o: node, p: { k: "lit", v: n.v }, opt: true };
      } else if (is("[")) {
        next();
        const p = expression();
        expect("]");
        node = { k: "get", o: node, p, opt: false };
      } else if (is("(")) {
        next();
        node = { k: "call", f: node, args: args(), opt: false };
      } else return node;
    }
  }

  function primary() {
    const t = next();
    if (t.t === "num" || t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "id") {
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null") return { k: "lit", v: null };
      if (["new", "function", "class", "this", "import", "eval", "arguments", "delete", "void", "typeof", "in", "instanceof", "yield", "await", "super"].includes(t.v)) {
        throw new FormulaError(`"${t.v}" is not allowed in a formula`);
      }
      return { k: "id", n: t.v };
    }
    if (t.t === "p" && t.v === "(") {
      const e = expression();
      expect(")");
      return e;
    }
    if (t.t === "end") throw new FormulaError("unexpected end of formula");
    throw new FormulaError(`unexpected "${t.v}" at ${t.at + 1}`);
  }

  const tree = expression();
  if (peek().t !== "end") throw new FormulaError(`unexpected "${peek().v}" at ${peek().at + 1}`);
  return tree;
}

/* Les arbres déjà lus, par texte de formule. */
const CACHE = new Map();

/**
 * Lit une formule (sans la calculer). Lève FormulaError si elle ne se
 * lit pas.
 */
export function parseFormula(src) {
  const s = String(src ?? "");
  if (s.length > MAX_SRC) throw new FormulaError("formula too long");
  let tree = CACHE.get(s);
  if (tree) return tree;
  tree = parse(s);
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(s, tree);
  return tree;
}

/* ------------------------------------------------------------ */
/*  Calcul                                                       */
/* ------------------------------------------------------------ */

/* Une méthode d'une valeur, en attente de son appel. */
class MethodRef { constructor(self, method) { this.self = self; this.method = method; } }
const isMethodRef = (v) => v instanceof MethodRef;

const isPlain = (o) => {
  if (!o || typeof o !== "object") return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
};

/** Lecture d'une propriété : seulement ce qui est sûr. */
function readProp(obj, key) {
  const name = typeof key === "number" ? key : String(key);
  if (typeof name === "string" && BLOCKED_PROPS.has(name)) throw new FormulaError(`"${name}" cannot be read`);
  if (obj === Math) {
    if (!Object.hasOwn(Math, name)) throw new FormulaError(`Math.${name} does not exist`);
    return Math[name];
  }
  if (obj === Number) {
    if (!NUMBER_STATICS.has(name)) throw new FormulaError(`Number.${name} is not allowed`);
    return Number[name];
  }
  if (obj === String) {
    if (!STRING_STATICS.has(name)) throw new FormulaError(`String.${name} is not allowed`);
    return String[name];
  }
  if (typeof obj === "string") {
    if (name === "length") return obj.length;
    if (/^\d+$/.test(String(name))) return obj[name];
    if (STRING_METHODS.has(name)) return new MethodRef(obj, name);
    throw new FormulaError(`text property "${name}" is not allowed`);
  }
  if (typeof obj === "number") {
    if (NUMBER_METHODS.has(name)) return new MethodRef(obj, name);
    throw new FormulaError(`number property "${name}" is not allowed`);
  }
  if (Array.isArray(obj)) {
    if (name === "length") return obj.length;
    if (/^\d+$/.test(String(name))) return obj[name];
    if (ARRAY_METHODS.has(name)) return new MethodRef(obj, name);
    throw new FormulaError(`list property "${name}" is not allowed`);
  }
  if (isPlain(obj)) return Object.hasOwn(obj, name) ? obj[name] : undefined;
  throw new FormulaError(`property "${name}" cannot be read here`);
}

/* Une méthode d'un texte, d'une liste ou d'un nombre, appelée sur sa valeur. */
function callMethod(ref, argv) {
  const { self, method } = ref;
  if (method === "repeat" && Number(argv[0]) * String(self).length > MAX_STRING) throw new FormulaError("text too long");
  if ((method === "padStart" || method === "padEnd") && Number(argv[0]) > MAX_STRING) throw new FormulaError("text too long");
  /* replace / replaceAll : seulement du texte, jamais une fonction. */
  if ((method === "replace" || method === "replaceAll") && argv.some(a => typeof a === "function" || (a && typeof a === "object"))) {
    throw new FormulaError("replace takes text only");
  }
  const out = self[method](...argv);
  if (typeof out === "string" && out.length > MAX_STRING) throw new FormulaError("text too long");
  return out;
}


function evaluate(node, env) {
  switch (node.k) {
    case "lit": return node.v;
    case "id": {
      if (Object.hasOwn(env.scope, node.n)) return env.scope[node.n];
      if (Object.hasOwn(env.funcs, node.n)) return env.funcs[node.n];
      if (Object.hasOwn(SAFE_GLOBALS, node.n)) return SAFE_GLOBALS[node.n];
      throw new ReferenceError(`${node.n} is not defined`);
    }
    case "if": return evaluate(node.test, env) ? evaluate(node.yes, env) : evaluate(node.no, env);
    case "un": {
      const a = value(evaluate(node.a, env));
      switch (node.op) {
        case "!": return !a;
        case "-": return -a;
        case "+": return +a;
        case "~": return ~a;
      }
      break;
    }
    case "bin": {
      if (node.op === "&&") { const a = value(evaluate(node.a, env)); return a ? value(evaluate(node.b, env)) : a; }
      if (node.op === "||") { const a = value(evaluate(node.a, env)); return a ? a : value(evaluate(node.b, env)); }
      if (node.op === "??") { const a = value(evaluate(node.a, env)); return a ?? value(evaluate(node.b, env)); }
      const a = value(evaluate(node.a, env));
      const b = value(evaluate(node.b, env));
      let out;
      switch (node.op) {
        case "+": out = a + b; break;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "**": return a ** b;
        case "==": return a == b; // eslint-disable-line eqeqeq
        case "!=": return a != b; // eslint-disable-line eqeqeq
        case "===": return a === b;
        case "!==": return a !== b;
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
        case "&": return a & b;
        case "|": return a | b;
        case "^": return a ^ b;
        case "<<": return a << b;
        case ">>": return a >> b;
        case ">>>": return a >>> b;
      }
      if (typeof out === "string" && out.length > MAX_STRING) throw new FormulaError("text too long");
      return out;
    }
    case "get": {
      const o = value(evaluate(node.o, env));
      if (node.opt && (o === null || o === undefined)) return undefined;
      if (o === null || o === undefined) throw new TypeError("cannot read a property of nothing");
      return readProp(o, value(evaluate(node.p, env)));
    }
    case "call": {
      const f = evaluate(node.f, env);
      if (node.opt && (f === null || f === undefined)) return undefined;
      const argv = node.args.map(a => value(evaluate(a, env)));
      if (isMethodRef(f)) return callMethod(f, argv);
      if (typeof f !== "function") throw new TypeError("not a function");
      if (!callableIn(env).has(f)) throw new FormulaError("this function cannot be called");
      return f(...argv);
    }
  }
  throw new FormulaError("unknown formula node");
}

/* Une référence de méthode ne sort jamais telle quelle d'une formule. */
function value(v) {
  if (isMethodRef(v)) throw new FormulaError(`${v.method} must be called`);
  return v;
}

/* Fonctions toujours appelables : les globales sûres et celles de
   Math / Number / String permises. */
const SAFE_CALLS = new Set([Number, String, Boolean, parseInt, parseFloat, isNaN, isFinite,
  ...Object.getOwnPropertyNames(Math).map(n => Math[n]).filter(f => typeof f === "function"),
  ...[...NUMBER_STATICS].map(n => Number[n]).filter(f => typeof f === "function"),
  ...[...STRING_STATICS].map(n => String[n]).filter(f => typeof f === "function")]);

/* …plus celles de la portée et les fonctions de formule (calculé une fois par calcul). */
function callableIn(env) {
  if (!env.callable) {
    env.callable = new Set(SAFE_CALLS);
    for (const v of Object.values(env.scope)) if (typeof v === "function") env.callable.add(v);
    for (const v of Object.values(env.funcs)) if (typeof v === "function") env.callable.add(v);
  }
  return env.callable;
}

/**
 * Calcule une formule.
 * @param {string} src    la formule
 * @param {object} scope  les clés (et fonctions) qu'elle peut lire
 * @param {object} funcs  les fonctions de formule (ceil, floor…) ; une
 *                        clé de même nom dans la portée gagne
 * @returns {*} le résultat ; lève une erreur si la formule ne se lit
 *              pas, lit une clé inconnue ou fait une chose interdite
 */
export function runFormula(src, scope = {}, funcs = {}) {
  const tree = parseFormula(src);
  const env = { scope: scope ?? {}, funcs: funcs ?? {}, callable: null };
  return value(evaluate(tree, env));
}
