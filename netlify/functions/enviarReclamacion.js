const { PDFDocument, rgb } = require('pdf-lib');
const sgMail = require('@sendgrid/mail');
const busboy = require('busboy');

// IMPORTANTE: Debes configurar tu clave de API de SendGrid en las variables de entorno de Netlify
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Función para parsear el formulario con imágenes
function parseMultipartForm(event) {
    return new Promise((resolve) => {
        const fields = {};
        const files = {};
        
        const bb = busboy({
            headers: { 'content-type': event.headers['content-type'] }
        });

        bb.on('file', (name, stream, info) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
                files[name] = {
                    content: Buffer.concat(chunks),
                    filename: info.filename,
                    contentType: info.mimeType
                };
            });
        });

        bb.on('field', (name, val) => {
            fields[name] = val;
        });

        bb.on('close', () => {
            resolve({ fields, files });
        });

        bb.end(Buffer.from(event.body, 'base64'));
    });
}


exports.handler = async function (event, context) {
    try {
        const { fields: data, files } = await parseMultipartForm(event);

        // --- 1. Generar el PDF en el servidor ---
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        
        // Cargar el logo (debes tenerlo en la misma carpeta de la función o usar una ruta absoluta)
        // Por simplicidad, omitimos el logo en el PDF del servidor. Se puede añadir con más lógica.
        
        page.drawText('FORMULARIO DE RECLAMACIÓN', { x: 50, y: 750, size: 20 });
        
        let y = 700;
        const addField = (label, value) => {
            page.drawText(`${label}: ${value}`, { x: 50, y, size: 12, color: rgb(0, 0, 0) });
            y -= 20;
        };

        addField('Fecha', data.fecha);
        addField('Empresa', data.empresa);
        addField('Contacto', data.contacto);
        addField('Factura/Albarán', data.factura);
        addField('Teléfono', data.telefono);
        addField('Referencia', data.referencia);
        
        y -= 10;
        page.drawText('Descripción del Defecto:', { x: 50, y, size: 12 });
        y -= 20;
        page.drawText(data.defecto, { x: 50, y, size: 10 });
        
        y -= 50; // Espacio para las imágenes

        if (files.fotoDelantera) {
            const img = await pdfDoc.embedJpg(files.fotoDelantera.content);
            page.drawImage(img, { x: 50, y: y - 150, width: 200 });
        }
        if (files.fotoTrasera) {
            const img = await pdfDoc.embedJpg(files.fotoTrasera.content);
            page.drawImage(img, { x: 270, y: y - 150, width: 200 });
        }

        const pdfBytes = await pdfDoc.save();

        // --- 2. Enviar el Correo con el PDF adjunto ---
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        const fileName = `Reclamacion_${data.empresa.replace(/ /g, '_')}_${data.fecha}.pdf`;

        const msg = {
            to: ['cvtools@cvtools.es', 'pablo@cvtools.es'],
            from: 'noreply@tudominio.com', // Un email que hayas verificado en SendGrid
            subject: `Nueva Reclamación de: ${data.empresa}`,
            text: `Se ha recibido una nueva reclamación. Los detalles están en el PDF adjunto.\n\nEmpresa: ${data.empresa}\nContacto: ${data.contacto}`,
            attachments: [
                {
                    content: pdfBase64,
                    filename: fileName,
                    type: 'application/pdf',
                    disposition: 'attachment',
                },
            ],
        };

        await sgMail.send(msg);

        // --- 3. Responder al navegador que todo fue bien ---
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Reclamación enviada con éxito' }),
        };

    } catch (error) {
        console.error('Error en la función:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.toString() }),
        };
    }
};