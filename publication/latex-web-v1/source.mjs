import fs from 'node:fs';

export const escapeHtml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function group(text, start, open = '{', close = '}') {
  while (/\s/.test(text[start] || '')) start++;
  if (text[start] !== open) throw new Error(`Expected ${open} at ${start}: ${text.slice(start,start+60)}`);
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return {value:text.slice(start+1,i), end:i+1};
  }
  throw new Error(`Unclosed group at ${start}`);
}
export function groups(text) {
  const result = [];
  let i = 0;
  while (i < text.length) {
    while (/\s/.test(text[i] || '')) i++;
    if (i === text.length) break;
    const item = group(text,i); result.push(item.value); i=item.end;
  }
  return result;
}
export function uncomment(text) {
  return text.split(/(?<=\n)/).map(line=>{
    for (let i=0;i<line.length;i++) {
      if (line[i]!=='%') continue;
      let slashes=0;
      for (let j=i-1;j>=0 && line[j]==='\\';j--) slashes++;
      if (slashes%2===0) return line.slice(0,i)+(line.endsWith('\n')?'\n':'');
    }
    return line;
  }).join('');
}
export function parseAux(text) {
  const labels = new Map();
  for (const match of text.matchAll(/\\newlabel\{([^}]+)\}/g)) {
    const fields = groups(group(text,match.index+match[0].length).value);
    if (!match[1].endsWith('@cref')) labels.set(match[1],{number:fields[0], anchor:fields[3], title:fields[2]});
  }
  for (const match of text.matchAll(/\\newlabel\{([^}]+)@cref\}\{\{\[([^\]]+)\]/g)) {
    if (labels.has(match[1])) labels.get(match[1]).kind = match[2];
  }
  return labels;
}
export function mathMacros(source) {
  const macros = {};
  const clean = uncomment(source);
  const command = /\\(DeclareMathOperator|newcommand|renewcommand|providecommand)\*?\s*/g;
  for (let match; (match=command.exec(clean));) {
    let cursor = command.lastIndex, name;
    if (clean[cursor] === '{') { const item=group(clean,cursor); name=item.value; cursor=item.end; }
    else { const item=/^\\(?:[A-Za-z]+|.)/.exec(clean.slice(cursor)); if (!item) throw new Error('Invalid macro declaration'); name=item[0]; cursor+=name.length; }
    while (/\s/.test(clean[cursor] || '')) cursor++;
    let count=0, defaultValue;
    if (clean[cursor] === '[') { const item=group(clean,cursor,'[',']'); count=Number(item.value); cursor=item.end; }
    while (/\s/.test(clean[cursor] || '')) cursor++;
    if (clean[cursor] === '[') { const item=group(clean,cursor,'[',']'); defaultValue=item.value; cursor=item.end; }
    const item=group(clean,cursor); command.lastIndex=item.end;
    let body=item.value.replace(/\\textup\b/g,'\\mathrm').replace(/\\normalfont\b/g,'\\mathrm');
    if (match[1] === 'DeclareMathOperator') body=`\\operatorname${match[0].includes('*')?'*':''}{${body}}`;
    macros[name.slice(1)]=count ? (defaultValue === undefined ? [body,count] : [body,count,defaultValue]) : body;
  }
  return macros;
}
export function readManifest(file) {
  const book=JSON.parse(fs.readFileSync(file,'utf8'));
  const ids=new Set(), labels=new Set();
  for (const [label,id,title] of book.entries) {
    if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id) || labels.has(label)) throw new Error(`Invalid/duplicate registry entry ${label}`);
    ids.add(id); labels.add(label);
  }
  return book;
}

// Keep TeX in each cell, but let the browser perform table layout. This avoids
// TeX4ht's paragraph-column alignment machinery for prose-heavy source tables.
export function linearizeTabular(text) {
  const opening=/\\begin\s*\{tabular\}/g;
  let output='',cursor=0;
  for(let match;(match=opening.exec(text));){
    const format=group(text,opening.lastIndex);
    const end=text.indexOf('\\end{tabular}',format.end);
    if(end<0)throw new Error('Unclosed tabular environment');
    const body=text.slice(format.end,end).replace(/\\(?:toprule|midrule|bottomrule|addlinespace)(?:\[[^\]]*\])?/g,'');
    if(/\\(?:multicolumn|multirow|begin\s*\{tabular)/.test(body))throw new Error('Spanning or nested tables need an explicit converter');
    const rows=[];let cells=[],start=0,depth=0;
    for(let i=0;i<body.length;i++){
      if(body[i]==='\\'){
        if(body[i+1]==='\\'&&depth===0){
          cells.push(body.slice(start,i).trim());rows.push(cells);cells=[];i++;start=i+1;
        }else i++;
        continue;
      }
      if(body[i]==='{')depth++;
      if(body[i]==='}')depth--;
      if(body[i]==='&'&&depth===0){cells.push(body.slice(start,i).trim());start=i+1;}
      if(depth<0)throw new Error('Unbalanced table cell');
    }
    if(depth)throw new Error('Unclosed group in table cell');
    if(body.slice(start).trim()||cells.length){cells.push(body.slice(start).trim());rows.push(cells);}
    if(!rows.length||rows.some(row=>row.length!==rows[0].length))throw new Error('Inconsistent table column count');
    const hcode=html=>`\\HCode{${html}}`;
    // Inert span markers survive TeX4ht's DOM filters without table repair.
    // Reconstruct the table only after each cell's TeX has become HTML.
    const htmlRows=rows.map((row,index)=>row.map((cell,column)=>hcode(`<span class="source-table-cell" data-row="${index}" data-column="${column}"></span>`)+cell+hcode('<span class="source-table-cell-end"></span>')+'\\par').join('\n')).join('\n');
    output+=text.slice(cursor,match.index)+'\\par'+hcode(`<span class="source-table-start" data-columns="${rows[0].length}"></span>`)+`\\par\n${htmlRows}\n`+hcode('<span class="source-table-end"></span>')+'\\par';
    cursor=end+'\\end{tabular}'.length;opening.lastIndex=cursor;
  }
  return output+text.slice(cursor);
}

export function restoreTabularHtml(html) {
  return html.replace(/(?:<p\b[^>]*>\s*)?<span class="source-table-start" data-columns="(\d+)"><\/span>([^]*?)<span class="source-table-end"><\/span>(?:\s*<\/p>)?/g,(_,columns,contents)=>{
    const rows=[];
    for(const cell of contents.matchAll(/<span\b([^>]*\bclass="source-table-cell"[^>]*)><\/span>([^]*?)<span class="source-table-cell-end"><\/span>/g)){
      const row=Number(cell[1].match(/\bdata-row="(\d+)"/)?.[1]),column=Number(cell[1].match(/\bdata-column="(\d+)"/)?.[1]);
      if(!Number.isInteger(row)||!Number.isInteger(column))throw new Error('Converted table cell lacks coordinates');
      rows[row]??=[];
      if(rows[row][column]!==undefined)throw new Error('Repeated converted table cell');
      rows[row][column]=cell[2].trim();
    }
    if(!rows.length||Array.from(rows).some(row=>!row||row.length!==Number(columns)||Array.from(row).some(cell=>cell===undefined)))throw new Error('Converted table lost cells');
    const tr=(row,header)=>`<tr>${row.map(cell=>header?`<th scope="col">${cell}</th>`:`<td>${cell}</td>`).join('')}</tr>`;
    return `<table class="source-data-table"><thead>${tr(rows[0],true)}</thead><tbody>${rows.slice(1).map(row=>tr(row,false)).join('')}</tbody></table>`;
  });
}
