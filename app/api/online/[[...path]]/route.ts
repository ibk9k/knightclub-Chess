import { env } from 'cloudflare:workers';
import { handleOnlineRequest } from '../../../../server/multiplayer';

export const dynamic = 'force-dynamic';
export function GET(request: Request) { return handleOnlineRequest(request, env.DB); }
export function POST(request: Request) { return handleOnlineRequest(request, env.DB); }
