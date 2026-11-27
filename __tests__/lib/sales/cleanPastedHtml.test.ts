import { cleanPastedHtml, pastedPlainTextHtml } from '@/lib/sales/cleanPastedHtml';

describe('cleanPastedHtml', () => {
  it('keeps text that a paste tried to hide and drops the empty office paragraph', () => {
    const html = `
      <html>
        <head><style>p.MsoNormal { margin: 0in 0in 8pt }</style></head>
        <body>
          <!--StartFragment-->
          <p class="MsoNormal" style="margin:0in 0in 12pt;color:#ffffff"><span style="color:#ffffff;font-size:0pt">Hello from Word</span><o:p></o:p></p>
          <p class="MsoNormal"><o:p>&nbsp;</o:p></p>
          <p class="MsoNormal"><span style="font-weight:bold">Bold line</span></p>
          <!--EndFragment-->
        </body>
      </html>`;

    expect(cleanPastedHtml(html, false)).toBe('<p style="margin-bottom:12pt">Hello from Word</p><p><b>Bold line</b></p>');
  });

  it('does not force bold when the pasted tag cancels it', () => {
    const html = '<b style="font-weight:normal;" id="docs-internal-guid"><span style="color:#000000;white-space:pre-wrap;">Visible text</span></b>';
    expect(cleanPastedHtml(html, false)).toBe('Visible text');
  });

  it('drops a script and keeps the surrounding words', () => {
    expect(cleanPastedHtml('<p>Hi<script>alert(1)</script> there</p>', false)).toBe('<p>Hi there</p>');
  });

  it('turns a pasted table into lines outside a custom section', () => {
    const html = '<table style="width:2000pt"><tr><td style="width:400pt">Item</td><td>Price</td></tr><tr><td>Tank</td><td>100</td></tr></table>';
    expect(cleanPastedHtml(html, false)).toBe('<div>Item Price</div><div>Tank 100</div>');
  });

  it('rebuilds a pasted table for a custom section without the spreadsheet widths', () => {
    const html = '<table style="width:2000pt"><tr><td style="width:400pt"><b>Item</b></td><td>Price</td></tr></table>';
    const cleaned = cleanPastedHtml(html, true);
    expect(cleaned).toBe('<table class="quotation-insert"><colgroup><col style="width:50.00%" /><col style="width:50.00%" /></colgroup><tbody><tr><td><b>Item</b></td><td>Price</td></tr></tbody></table>');
    expect(cleaned).not.toContain('pt');
  });

  it('keeps italic and underline and drops an empty list item', () => {
    const html = '<ul><li>One</li><li>&nbsp;</li><li><span style="font-style:italic;text-decoration:underline">Two</span></li></ul>';
    expect(cleanPastedHtml(html, false)).toBe('<ul><li>One</li><li><i><u>Two</u></i></li></ul>');
  });

  it('keeps line height and a normal paragraph gap, and drops a gap that would open a blank hole', () => {
    expect(cleanPastedHtml('<p style="line-height:1.5;margin-bottom:8pt;color:#ffffff">Spaced</p>', false)).toBe('<p style="line-height:1.5;margin-bottom:8pt">Spaced</p>');
    expect(cleanPastedHtml('<span style="line-height:150%;color:#ffffff">Hi</span>', false)).toBe('<span style="line-height:150%">Hi</span>');
    expect(cleanPastedHtml('<p style="margin-top:200pt;line-height:0">Shown</p>', false)).toBe('<p>Shown</p>');
    expect(cleanPastedHtml('<p style="margin-bottom:12pt">&nbsp;</p>', false)).toBe('');
  });

  it('returns nothing for a paste that is only blank paragraphs', () => {
    expect(cleanPastedHtml('<p>&nbsp;</p><p><br></p><div></div>', false)).toBe('');
  });
});

describe('pastedPlainTextHtml', () => {
  it('keeps line breaks and escapes html typed as text', () => {
    expect(pastedPlainTextHtml('Tank & pump\nNext')).toBe('Tank &amp; pump<br>Next');
    expect(pastedPlainTextHtml(' \n ')).toBe('');
  });
});
