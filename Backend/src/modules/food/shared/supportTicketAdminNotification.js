export async function emitAdminSupportTicketCreated(payload = {}) {
    try {
        const { getIO, rooms } = await import('../../../config/socket.js');
        const io = getIO();
        if (!io) return;

        io.to(rooms.admin()).emit('admin_support_ticket_created', {
            type: 'support_ticket_created',
            source: payload.source || 'user',
            ticketId: String(payload.ticketId || ''),
            title: payload.title || 'New Support Ticket',
            message: payload.message || 'A new support ticket has been raised.',
            createdAt: payload.createdAt || new Date().toISOString()
        });
    } catch (error) {
        console.error('Failed to emit admin support ticket notification:', error);
    }
}
