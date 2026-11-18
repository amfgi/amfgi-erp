export async function downloadEmployeeHistoryPdf(sheet: HTMLElement, fileName: string) {
  const { default: html2canvas } = await import('html2canvas-pro');
  const { jsPDF } = await import('jspdf');
  const previousLeft = sheet.style.left;
  const previousZ = sheet.style.zIndex;
  sheet.style.left = '0px';
  sheet.style.zIndex = '-1';
  try {
    const canvas = await html2canvas(sheet, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: sheet.scrollWidth,
      windowHeight: sheet.scrollHeight,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const margin = 8;
    const pageWidth = 210 - margin * 2;
    const pageHeight = 297 - margin * 2;
    const sliceHeight = Math.max(1, Math.floor((canvas.width * pageHeight) / pageWidth));
    let offset = 0;
    let page = 0;
    while (offset < canvas.height && page < 30) {
      const height = Math.min(sliceHeight, canvas.height - offset);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = height;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Could not build the PDF');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageWidth, (height * pageWidth) / canvas.width);
      offset += height;
      page += 1;
    }
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    sheet.style.left = previousLeft;
    sheet.style.zIndex = previousZ;
  }
}
