import assert from 'node:assert/strict';
import {group, parseAux, mathMacros, uncomment, linearizeTabular, restoreTabularHtml} from './source.mjs';

// Nested titles must not shift the fourth AUX field used as a PDF destination.
const aux=String.raw`\newlabel{lem:A}{{2.3}{7}{A {nested} title}{lemma.2.3}{}}
\newlabel{lem:A@cref}{{[lemma][3][2]2.3}{[1][7][]7}}`;
assert.deepEqual(parseAux(aux).get('lem:A'),{number:'2.3',anchor:'lemma.2.3',title:'A {nested} title',kind:'lemma'});
assert.equal(group(String.raw`{a {b} \{c\} d}`,0).value,String.raw`a {b} \{c\} d`);
assert.throws(()=>group('{a {b}',0),/Unclosed/);
assert.equal(uncomment(String.raw`a\%b% removed`),'a\\%b');
assert.equal(uncomment(String.raw`a\\% removed`),'a\\\\');
const macros=mathMacros(String.raw`
% \newcommand{\ignored}{bad}
\DeclareMathOperator*{\colim}{colim}
\newcommand\pair[2]{\langle #1,{#2}\rangle}
\newcommand{\optional}[2][X]{#1+#2}
\renewcommand{\Cat}{\textup{Cat}}`);
assert.deepEqual(macros,{colim:'\\operatorname*{colim}',pair:['\\langle #1,{#2}\\rangle',2],optional:['#1+#2',2,'X'],Cat:'\\mathrm{Cat}'});
console.log('Validated nested AUX destinations, escaped comments, and balanced MathJax macro declarations.');
const table=linearizeTabular(String.raw`Before \begin{tabular}{p{.3\textwidth}p{.7\textwidth}}
\toprule Chapter & Sources \\
\midrule One & \emph{A title} and \HCode{<a href="a?x=1&amp;y=2">link</a>} \\
\bottomrule\end{tabular} After`);
assert(table.startsWith('Before '));assert(table.endsWith(' After'));
assert.equal((table.match(/class="source-table-cell"/g)||[]).length,4);
assert(table.includes(String.raw`\emph{A title}`));assert(table.includes('a?x=1&amp;y=2'));
assert(!table.includes('\\begin{tabular}'));
assert.throws(()=>linearizeTabular(String.raw`\begin{tabular}{ll}A & B \\ C \end{tabular}`),/column count/);
const restored=restoreTabularHtml('<p><span class="source-table-start" data-columns="2"></span></p><p><span class="source-table-cell" data-row="0" data-column="0"></span>A<span class="source-table-cell-end"></span></p><p><span class="source-table-cell" data-row="0" data-column="1"></span><em>B</em><span class="source-table-cell-end"></span></p><p><span class="source-table-end"></span></p>');
assert.equal(restored,'<table class="source-data-table"><thead><tr><th scope="col">A</th><th scope="col"><em>B</em></th></tr></thead><tbody></tbody></table>');
assert.equal(restoreTabularHtml('<span class="source-table-start" data-columns="1"></span><span data-column="0" class="source-table-cell" data-row="0"></span>A<span class="source-table-cell-end"></span><span class="source-table-end"></span>'),'<table class="source-data-table"><thead><tr><th scope="col">A</th></tr></thead><tbody></tbody></table>');
console.log('Validated prose-table conversion with nested TeX groups and HTML entities.');
