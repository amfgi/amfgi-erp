import { NextResponse } from 'next/server';

import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { getAttachmentForDownload } from '@/lib/sales/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const attachment = await getAttachmentForDownload(session.companyId, id, session.access);
    return NextResponse.redirect(
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(attachment.driveFileId)}`,
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
