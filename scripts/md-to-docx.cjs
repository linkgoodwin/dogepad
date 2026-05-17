const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageBreak, ShadingType, VerticalAlign
} = require('docx');

const COLORS = {
  investor: { primary: '1a365d', accent: '2b6cb0', bg: 'ebf4ff' },
  creator: { primary: '744210', accent: 'c05621', bg: 'fffaf0' },
  builder: { primary: '1a202c', accent: '4a5568', bg: 'f7fafc' },
  player: { primary: '22543d', accent: '2f855a', bg: 'f0fff4' },
};

function parseMd(text) {
  const lines = text.split('\n');
  const elements = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^---+$/)) {
      if (inTable && tableRows.length > 0) {
        elements.push({ type: 'table', rows: tableRows });
        tableRows = [];
        inTable = false;
      }
      elements.push({ type: 'hr' });
      continue;
    }

    if (line.startsWith('# ')) {
      if (inTable && tableRows.length > 0) { elements.push({ type: 'table', rows: tableRows }); tableRows = []; inTable = false; }
      elements.push({ type: 'h1', text: line.slice(2) });
    } else if (line.startsWith('## ')) {
      if (inTable && tableRows.length > 0) { elements.push({ type: 'table', rows: tableRows }); tableRows = []; inTable = false; }
      elements.push({ type: 'h2', text: line.slice(3) });
    } else if (line.startsWith('### ')) {
      if (inTable && tableRows.length > 0) { elements.push({ type: 'table', rows: tableRows }); tableRows = []; inTable = false; }
      elements.push({ type: 'h3', text: line.slice(4) });
    } else if (line.startsWith('#### ')) {
      if (inTable && tableRows.length > 0) { elements.push({ type: 'table', rows: tableRows }); tableRows = []; inTable = false; }
      elements.push({ type: 'h4', text: line.slice(5) });
    } else if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true;
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (!cells.every(c => c.match(/^[-:]+$/))) {
        tableRows.push(cells);
      }
    } else {
      if (inTable && tableRows.length > 0) {
        elements.push({ type: 'table', rows: tableRows });
        tableRows = [];
        inTable = false;
      }
      if (line.trim() === '') {
        elements.push({ type: 'blank' });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push({ type: 'li', text: line.slice(2) });
      } else if (line.match(/^\d+\.\s/)) {
        elements.push({ type: 'oli', text: line.replace(/^\d+\.\s/, '') });
      } else {
        elements.push({ type: 'p', text: line });
      }
    }
  }
  if (tableRows.length > 0) elements.push({ type: 'table', rows: tableRows });
  return elements;
}

function parseInline(text) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: 21 }));
    } else if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, size: 21 }));
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: 'Consolas', size: 20, shading: { type: ShadingType.SOLID, color: 'f0f0f0' } }));
    } else {
      runs.push(new TextRun({ text: part, size: 21 }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: '', size: 21 })];
}

function buildArchitectureDiagram(cs) {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const boxBorder = { style: BorderStyle.SINGLE, size: 2, color: cs.accent };
  const boxBorders = { top: boxBorder, bottom: boxBorder, left: boxBorder, right: boxBorder };

  function boxCell(text, sub, width, shading) {
    const children = [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 20, color: cs.primary, font: 'Microsoft YaHei' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 0 },
      }),
    ];
    if (sub) {
      children.push(new Paragraph({
        children: [new TextRun({ text: sub, size: 16, color: '666666', font: 'Microsoft YaHei' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
      }));
    }
    return new TableCell({
      children,
      borders: boxBorders,
      width: { size: width, type: WidthType.DXA },
      shading: shading ? { type: ShadingType.SOLID, color: shading } : undefined,
      verticalAlign: VerticalAlign.CENTER,
    });
  }

  function arrowCell(text, width) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: text || '↓', size: 22, color: cs.accent, font: 'Microsoft YaHei' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 40 },
      })],
      borders: noBorders,
      width: { size: width, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
    });
  }

  function emptyCell(width) {
    return new TableCell({
      children: [new Paragraph({ children: [], spacing: { before: 20, after: 20 } })],
      borders: noBorders,
      width: { size: width, type: WidthType.DXA },
    });
  }

  const layerShading = { l1: 'e8f0fe', l2: 'fef3e2', l3: 'e8f5e9' };

  const row1 = new TableRow({
    children: [emptyCell(2500), boxCell('LaunchDAO', 'DAO投票发射', 4000, layerShading.l1), emptyCell(2500)],
  });
  const row2 = new TableRow({
    children: [emptyCell(2500), arrowCell('createTokenForDao / buyForDao', 4000), emptyCell(2500)],
  });
  const row3 = new TableRow({
    children: [
      boxCell('BondingCurveFactory', '代币创建工厂', 2500, layerShading.l2),
      boxCell('BondingCurve', '核心联合曲线交易', 4000, layerShading.l2),
      boxCell('BondingCurveToken', 'ERC20税制代币', 2500, layerShading.l2),
    ],
  });
  const row4 = new TableRow({
    children: [emptyCell(2500), arrowCell('DEX上线后资金分配', 4000), emptyCell(2500)],
  });
  const row5 = new TableRow({
    children: [
      boxCell('LongPool', 'BNB借贷池 (20%BNB)', 2500, layerShading.l3),
      boxCell('BuyAndBurnEngine', 'FAIR销毁引擎 (10%BNB)', 2500, layerShading.l3),
      boxCell('FeeDistributor', '费用分配 (5%BNB+税)', 2500, layerShading.l3),
    ],
  });
  const row6 = new TableRow({
    children: [
      boxCell('ShortPool', 'Token借贷/做空 (10%Token)', 2500, layerShading.l3),
      boxCell('PriceOracle', 'TWAP价格预言机', 2500, layerShading.l3),
      boxCell('CreatorRewardManager', '创作者归属管理', 2500, layerShading.l3),
    ],
  });

  return new Table({
    rows: [row1, row2, row3, row4, row5, row6],
    width: { size: 9000, type: WidthType.DXA },
  });
}

function buildDoc(elements, title, colorScheme, isBuilder) {
  const children = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 52, color: colorScheme.primary, font: 'Microsoft YaHei' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'FairForge 公平发射台', size: 28, color: colorScheme.accent, font: 'Microsoft YaHei' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: new Date().toISOString().split('T')[0], size: 22, color: '888888' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  for (const el of elements) {
    switch (el.type) {
      case 'h1':
        children.push(new Paragraph({
          children: [new TextRun({ text: el.text, bold: true, size: 36, color: colorScheme.primary, font: 'Microsoft YaHei' })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }));
        break;
      case 'h2':
        children.push(new Paragraph({
          children: [new TextRun({ text: el.text, bold: true, size: 30, color: colorScheme.accent, font: 'Microsoft YaHei' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        }));
        break;
      case 'h3':
        children.push(new Paragraph({
          children: [new TextRun({ text: el.text, bold: true, size: 26, color: colorScheme.primary, font: 'Microsoft YaHei' })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }));
        if (isBuilder && el.text.includes('合约架构图')) {
          const archTable = buildArchitectureDiagram(colorScheme);
          children.push(archTable);
          children.push(new Paragraph({ children: [], spacing: { after: 100 } }));
        }
        break;
      case 'h4':
        children.push(new Paragraph({
          children: [new TextRun({ text: el.text, bold: true, size: 23, font: 'Microsoft YaHei' })],
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 150, after: 80 },
        }));
        break;
      case 'p':
        children.push(new Paragraph({
          children: parseInline(el.text),
          spacing: { after: 100 },
        }));
        break;
      case 'li':
        children.push(new Paragraph({
          children: [new TextRun({ text: '• ', size: 21 }), ...parseInline(el.text)],
          indent: { left: 360 },
          spacing: { after: 60 },
        }));
        break;
      case 'oli':
        children.push(new Paragraph({
          children: parseInline(el.text),
          indent: { left: 360 },
          spacing: { after: 60 },
        }));
        break;
      case 'hr':
        children.push(new Paragraph({
          children: [new TextRun({ text: '─'.repeat(50), color: 'cccccc', size: 16 })],
          spacing: { before: 200, after: 200 },
        }));
        break;
      case 'blank':
        children.push(new Paragraph({ children: [], spacing: { after: 60 } }));
        break;
      case 'table':
        if (el.rows.length > 0) {
          const maxCols = Math.max(...el.rows.map(r => r.length));
          const tableChildren = el.rows.map((row, ri) => {
            const cells = [];
            for (let ci = 0; ci < maxCols; ci++) {
              const cellText = row[ci] || '';
              cells.push(new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({
                    text: cellText,
                    bold: ri === 0,
                    size: ri === 0 ? 20 : 19,
                    font: 'Microsoft YaHei',
                    color: ri === 0 ? colorScheme.primary : '333333',
                  })],
                  spacing: { before: 40, after: 40 },
                })],
                shading: ri === 0 ? { type: ShadingType.SOLID, color: colorScheme.bg } : undefined,
                width: { size: Math.floor(9000 / maxCols), type: WidthType.DXA },
              }));
            }
            return new TableRow({ children: cells });
          });
          children.push(new Table({
            rows: tableChildren,
            width: { size: 9000, type: WidthType.DXA },
          }));
          children.push(new Paragraph({ children: [], spacing: { after: 150 } }));
        }
        break;
    }
  }

  return new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: {
          run: { font: 'Microsoft YaHei', size: 21 },
        },
      },
    },
  });
}

async function convert(mdFile, docxFile, title, colorKey, isBuilder) {
  const md = fs.readFileSync(mdFile, 'utf-8');
  const elements = parseMd(md);
  const doc = buildDoc(elements, title, COLORS[colorKey], isBuilder || false);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxFile, buffer);
  console.log(`✅ ${path.basename(docxFile)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  const docsDir = path.join(__dirname, '..', 'docs');

  await convert(
    path.join(docsDir, 'whitepaper-investor.md'),
    path.join(docsDir, 'FairForge融资白皮书.docx'),
    'FairForge 融资白皮书',
    'investor'
  );

  await convert(
    path.join(docsDir, 'whitepaper-creator.md'),
    path.join(docsDir, 'FairForge创作者白皮书.docx'),
    'FairForge 创作者白皮书',
    'creator'
  );

  await convert(
    path.join(docsDir, 'whitepaper-builder.md'),
    path.join(docsDir, 'FairForge搭建白皮书.docx'),
    'FairForge 搭建运维白皮书',
    'builder',
    true
  );

  await convert(
    path.join(docsDir, 'whitepaper-player.md'),
    path.join(docsDir, 'FairForge玩家白皮书.docx'),
    'FairForge 玩家参与白皮书',
    'player'
  );

  console.log('\n🎉 全部4份Word文档生成完成！');
}

main().catch(console.error);
