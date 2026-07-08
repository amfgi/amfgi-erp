import { errorResponse } from '@/lib/utils/apiResponse';

/** Pay runs are temporarily disabled. */
export async function GET() {
  return errorResponse('Pay runs are temporarily disabled', 410);
}

export async function DELETE() {
  return errorResponse('Pay runs are temporarily disabled', 410);
}
