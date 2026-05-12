import JSZip from 'jszip'

function colLetter(n) {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function buildChartXml(seriesNames, nDataRows) {
  const lastRow = nDataRows + 1 // +1 for header row

  const seriesXml = seriesNames.map((name, i) => {
    const col = colLetter(i + 2) // B, C, D …
    return `<c:ser>
      <c:idx val="${i}"/><c:order val="${i}"/>
      <c:tx><c:strRef><c:f>curves!$${col}$1</c:f>
        <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache>
      </c:strRef></c:tx>
      <c:marker><c:symbol val="none"/></c:marker>
      <c:xVal><c:numRef><c:f>curves!$A$2:$A$${lastRow}</c:f></c:numRef></c:xVal>
      <c:yVal><c:numRef><c:f>curves!$${col}$2:$${col}$${lastRow}</c:f></c:numRef></c:yVal>
      <c:smooth val="1"/>
    </c:ser>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:chart>
    <c:autoTitleDeleted val="1"/>
    <c:plotArea>
      <c:scatterChart>
        <c:scatterStyle val="smoothMarker"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:axId val="1"/><c:axId val="2"/>
      </c:scatterChart>
      <c:valAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="b"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="2"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/><c:axPos val="l"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="1"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`
}

// Chart anchored at A3 (col 0, row 2 in 0-based), spanning ~10 cols × 20 rows
function buildDrawingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from>
      <xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Chart 1"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
}

function nextRelId(xml) {
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]))
  return `rId${ids.length ? Math.max(...ids) + 1 : 1}`
}

export async function addChartToXlsx(xlsxArray, seriesNames, nDataRows) {
  const zip = await JSZip.loadAsync(xlsxArray)

  // Add chart + drawing files
  zip.file('xl/charts/chart1.xml', buildChartXml(seriesNames, nDataRows))
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml())
  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"
    Target="../charts/chart1.xml"/>
</Relationships>`)

  // Patch sheet1.xml — append <drawing> before </worksheet>
  const sheetPath = 'xl/worksheets/sheet1.xml'
  let sheetXml = await zip.file(sheetPath).async('string')
  if (!sheetXml.includes('<drawing ')) {
    sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>')
  }
  zip.file(sheetPath, sheetXml)

  // Create / patch sheet1.xml.rels
  const relsPath = 'xl/worksheets/_rels/sheet1.xml.rels'
  const existingRels = zip.file(relsPath)
  if (existingRels) {
    let relsXml = await existingRels.async('string')
    const id = nextRelId(relsXml)
    relsXml = relsXml.replace('</Relationships>',
      `<Relationship Id="${id}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
    Target="../drawings/drawing1.xml"/>
</Relationships>`)
    zip.file(relsPath, relsXml)
  } else {
    zip.file(relsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
    Target="../drawings/drawing1.xml"/>
</Relationships>`)
  }

  // Patch [Content_Types].xml
  let ct = await zip.file('[Content_Types].xml').async('string')
  if (!ct.includes('drawingml.chart')) {
    ct = ct.replace('</Types>',
      `<Override PartName="/xl/drawings/drawing1.xml"
    ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml"
    ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`)
  }
  zip.file('[Content_Types].xml', ct)

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
