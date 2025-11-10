const { PDFDocument, rgb } = require('pdf-lib');
const sgMail = require('@sendgrid/mail');
const busboy = require('busboy');

// La clave de API se lee de las variables de entorno de Netlify por seguridad
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Función para procesar el formulario multipart/form-data
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

// Handler principal de la función serverless
exports.handler = async function (event, context) {
    try {
        const { fields: data, files } = await parseMultipartForm(event);

        // 1. Crear un nuevo documento PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        
        // 2. Escribir la información del formulario en el PDF
        page.drawText('FORMULARIO DE RECLAMACIÓN', { x: 50, y: 750, size: 20 });
        
        let y = 700;
        const addField = (label, value) => {
            page.drawText(`${label}: ${value || ''}`, { x: 50, y, size: 12, color: rgb(0, 0, 0) });
            y -= 25;
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
        // La descripción puede ocupar varias líneas
        page.drawText(data.defecto, { x: 50, y, size: 10, lineHeight: 15, maxWidth: 500 });
        
        y -= 100; // Dejar espacio para las imágenes

        // 3. Incrustar las imágenes (JPG o PNG)
        if (files.fotoDelantera) {
            let img;
            if (files.fotoDelantera.contentType === 'image/jpeg') {
                img = await pdfDoc.embedJpg(files.fotoDelantera.content);
            } else if (files.fotoDelantera.contentType === 'image/png') {
                img = await pdfDoc.embedPng(files.fotoDelantera.content);
            }
            if (img) page.drawImage(img, { x: 50, y: y, width: 200, height: 150 });
        }
        
        if (files.fotoTrasera) {
            let img;
            if (files.fotoTrasera.contentType === 'image/jpeg') {
                img = await pdfDoc.embedJpg(files.fotoTrasera.content);
            } else if (files.fotoTrasera.contentType === 'image/png') {
                img = await pdfDoc.embedPng(files.fotoTrasera.content);
            }
            if (img) page.drawImage(img, { x: 270, y: y, width: 200, height: 150 });
        }

        // 4. Guardar el PDF y prepararlo para el envío
        const pdfBytes = await pdfDoc.save();
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        const fileName = `Reclamacion_${data.empresa.replace(/ /g, '_')}_${data.fecha}.pdf`;

        // 5. Configurar y enviar el correo con SendGrid
        const msg = {
            to: ['cvtools@cvtools.es', 'pablo@cvtools.es'],
            from: 'formularios@cvtools.es', // IMPORTANTE: Usa un email que hayas verificado en tu cuenta de SendGrid
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

        // 6. Enviar respuesta de éxito al navegador
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Reclamación enviada con éxito' }),
        };

    } catch (error) {
        console.error('Error en la función:', error);
        // Enviar respuesta de error al navegador
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Error en el servidor: ${error.message}` }),
        };
    }
};