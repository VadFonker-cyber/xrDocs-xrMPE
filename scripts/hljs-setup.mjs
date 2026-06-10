/**
 * Configures highlight.js for both Node.js build scripts and the browser bundle.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dos from 'highlight.js/lib/languages/dos';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('bat', dos);
hljs.registerLanguage('batch', dos);
hljs.registerLanguage('cmd', dos);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('pwsh', powershell);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('xml', xml);

export { hljs };
