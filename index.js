const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = ['https://presentation-frontend-gamma.vercel.app', 'https://collaborative-presentation-backend-1.onrender.com'];

// CORS Middleware
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));

// Create HTTP server using the Express app
const server = http.createServer(app); // Define the 'server' here

// Set up Socket.io server
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});



let presentations = {}; // Store all presentations

// Helper function to create a blank slide
const createNewSlide = () => {
    return {
        drawings: [], // Store drawing data per slide
    };
};

io.on('connection', (socket) => {
    console.log('A user connected');

    // Creating a new presentation
    socket.on('create_presentation', (presentationId, nickname) => {
        if (!presentations[presentationId]) {
            presentations[presentationId] = {
                slides: [createNewSlide()], // Initialize with one slide
                users: {}
            };
        }

        // Add the creator to the user list with the 'Editor' role
        presentations[presentationId].users[socket.id] = {
            nickname,
            role: 'Editor'
        };

        // Broadcast the updated list of presentations
        io.emit('presentation_list', Object.keys(presentations).map((id) => ({
            id,
            name: `Presentation ${id.substring(0, 5)}`,
        })));

        // Send the updated user list for the presentation
        io.to(presentationId).emit('user_list', presentations[presentationId].users);
    });

    // User joining a presentation
    socket.on('join_presentation', ({ presentationId, nickname }) => {
        if (!presentations[presentationId]) {
            socket.emit('error', 'Presentation not found');
            return;
        }

        socket.join(presentationId);

        // Add the user to the presentation's user list if not already present
        if (!presentations[presentationId].users[socket.id]) {
            presentations[presentationId].users[socket.id] = {
                nickname,
                role: 'Viewer' // Default role for new users
            };
        }

        // Send existing drawings and slides to the new user
        socket.emit('canvas_data', presentations[presentationId].slides[presentations[presentationId].slides.length - 1].drawings);
        socket.emit('slide_data', presentations[presentationId].slides);

        // Broadcast the updated user list to everyone in the presentation
        io.to(presentationId).emit('user_list', presentations[presentationId].users);
    });

    // Emit the presentation list when requested by the client
socket.on('get_presentations', () => {
    socket.emit('presentation_list', Object.keys(presentations).map((id) => ({
        id,
        name: `Presentation ${id.substring(0, 5)}`,
    })));
});


    // Handle drawing event
    socket.on('drawing', (data) => {
        const { presentationId, slideIndex, x0, y0, x1, y1, tool } = data;

        // Store the drawing on the correct slide
        presentations[presentationId].slides[slideIndex].drawings.push({ x0, y0, x1, y1, tool });

        // Broadcast the drawing to other users
        socket.broadcast.to(presentationId).emit('drawing', data);
    });

    // Handle adding a new slide
    socket.on('add_slide', (presentationId) => {
        const newSlide = createNewSlide();
        presentations[presentationId].slides.push(newSlide);

        // Broadcast the addition of the new slide
        io.to(presentationId).emit('slide_added', presentations[presentationId].slides.length - 1);
    });

    socket.on('switch_slide', (slideId) => {
    const drawingData = presentations[slideId] || [];
    socket.emit('load_drawings', slideId, drawingData); // Send the drawing history for this slide
});


    // Switch user role (Viewer <-> Editor)
    socket.on('switch_role', ({ userId, presentationId, newRole }) => {
        const presentation = presentations[presentationId];
        if (presentation && presentation.users[userId]) {
            presentation.users[userId].role = newRole;

            // Broadcast the updated role to the presentation users
            io.to(presentationId).emit('role_updated', { userId, newRole });
        }
    });

    // Disconnecting a user
    socket.on('disconnect', () => {
        for (const [presentationId, presentation] of Object.entries(presentations)) {
            if (presentation.users[socket.id]) {
                delete presentation.users[socket.id];
                io.to(presentationId).emit('user_list', presentation.users); // Broadcast updated user list
            }
        }
        console.log('A user disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
