const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

const rooms = new Map(); // roomId -> { players: [{socketId, name}], gameState: object | null }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, playerName }, callback) => {
    // If the room name or player name is entirely an integer/number, reject it
    
    if (!isNaN(playerName) && String(playerName).trim() !== '') {
      if (callback) callback({ error: 'שם שחקן לא יכול להיות מספר בלבד' });
      return;
    }

    if (rooms.has(roomId)) {
       const roomData = rooms.get(roomId);
       // Reject if game already started
       if (roomData.gameState && roomData.gameState.phase !== 'setup' && roomData.gameState.phase !== 'waiting') {
           if (callback) callback({ error: 'החדר כבר פעיל במשחק! לא ניתן להצטרף לחדר קיים שכבר התחיל' });
           return;
       }
       
       // Reject if name is already taken in the room
       const isNameTaken = roomData.players.some(p => p.name === playerName && p.socketId !== socket.id);
       if (isNameTaken) {
           if (callback) callback({ error: 'השם הזה כבר תפוס בחדר' });
           return;
       }
    }

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { players: [], gameState: null });
    }

    const roomData = rooms.get(roomId);
    
    // Check if player already in room
    const existingPlayerIndex = roomData.players.findIndex(p => p.socketId === socket.id);
    if (existingPlayerIndex === -1) {
        roomData.players.push({ socketId: socket.id, name: playerName });
    } else {
        roomData.players[existingPlayerIndex].name = playerName;
    }

    io.to(roomId).emit('player-joined', {
      players: roomData.players,
      gameState: roomData.gameState
    });

    if (callback) callback({ success: true });
  });

  socket.on('sync-game', ({ roomId, G }) => {
    const roomData = rooms.get(roomId);
    if (roomData) {
      roomData.gameState = G;
      // Broadcast to everyone in the room except the sender
      socket.to(roomId).emit('game-updated', G);
    }
  });

  socket.on('disconnecting', () => {
    // remove player from any rooms they were in
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        const roomData = rooms.get(roomId);
        if (roomData) {
          roomData.players = roomData.players.filter(p => p.socketId !== socket.id);
          io.to(roomId).emit('player-joined', {
            players: roomData.players,
            gameState: roomData.gameState
          });
          if (roomData.players.length === 0) {
              rooms.delete(roomId);
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
