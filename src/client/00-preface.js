/**
 * 简历市场 client — 00 前言：React 句柄、i18n、HTTP 桥、小工具函数。
 * 本文件会被 build/build.mjs 按序拼进同一个模块工厂函数里，
 * 所以这里的顶层 var/function 对后续文件全部可见；不要写 import/export。
 */
var React = require('react');
var h = React.createElement;

var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useMemo = React.useMemo;
var useCallback = React.useCallback;

var NS = 'resumeMarket';
var API = '/resume-market/api';

var RM_STRINGS = {
  zh: {
    panel: '简历市场',
    title: '简历市场',
    subtitle: '免费模板 · 大肥鱼出品',
    empty: '还没有简历，点右上角「新建」开始',
  },
  en: {
    panel: 'Resume Market',
    title: 'Resume Market',
    subtitle: 'Free templates by 大肥鱼',
    empty: 'No resume yet. Create one from the top-right button.',
  },
};

function rmLang() {
  try {
    var nav = typeof navigator !== 'undefined' ? navigator : null;
    var lang =
      (nav && (nav.language || (nav.languages && nav.languages[0]))) ||
      (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) ||
      'en';
    return /^zh/i.test(String(lang)) ? 'zh' : 'en';
  } catch (e) {
    return 'en';
  }
}

function rt(key) {
  var dict = RM_STRINGS[rmLang()] || RM_STRINGS.en;
  return dict[key] != null ? dict[key] : key;
}

function rmLog() {
  try {
    if (typeof console !== 'undefined' && console.warn) console.warn.apply(console, arguments);
  } catch (e) {
    /* ignore */
  }
}

/**
 * 调 Host 的 /resume-market/api。返回 {ok,value} 里的 value，失败抛 Error(message)。
 * @param {string} path 以 / 开头的接口路径
 * @param {{method?: string, body?: any}} [opts]
 */
function rmApi(path, opts) {
  var method = (opts && opts.method) || 'GET';
  var init = { method: method, headers: { accept: 'application/json' } };
  if (opts && opts.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  return fetch(API + path, init).then(function (res) {
    return res
      .json()
      .catch(function () {
        return { ok: false, error: { message: '服务返回了非 JSON 内容' } };
      })
      .then(function (json) {
        if (!json || json.ok !== true) {
          var message = json && json.error && json.error.message ? json.error.message : '请求失败';
          var err = new Error(message);
          err.code = json && json.error ? json.error.code : 'http';
          throw err;
        }
        return json.value;
      });
  });
}

function rmErrText(err) {
  return (err && err.message) || String(err);
}

/** 空白简历数据（新建「空白简历」用）。 */
function rmBlankData() {
  return {
    basics: { name: '', role: '', phone: '', email: '', city: '', wechat: '', github: '', website: '' },
    summary: '',
    experience: [],
    projects: [],
    education: [],
    skills: [],
    awards: [],
  };
}

function rmFormatTime(iso) {
  if (!iso) return '';
  try {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var pad = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  } catch (e) {
    return '';
  }
}

function rmCopyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  } catch (e) {
    /* ignore */
  }
  return Promise.reject(new Error('浏览器不允许写剪贴板'));
}
