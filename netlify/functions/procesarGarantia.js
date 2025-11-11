const PDFDocument = require('pdfkit');
const sgMail = require('@sendgrid/mail');
const busboy = require('busboy');
const fs = require('fs').promises;
const path = require('path');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function parseMultipartForm(event) {
    return new Promise((resolve) => {
        const fields = {};
        const files = {};
        const bb = busboy({ headers: { 'content-type': event.headers['content-type'] } });
        bb.on('file', (name, stream, info) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => { files[name] = { content: Buffer.concat(chunks), filename: info.filename, contentType: info.mimeType }; });
        });
        bb.on('field', (name, val) => { fields[name] = val; });
        bb.on('close', () => { resolve({ fields, files }); });
        bb.end(Buffer.from(event.body, 'base64'));
    });
}

// --- INICIO DE LA REESCRITURA DEL PDF ---
function generatePdf(data, files) {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // --- DIBUJANDO EL NUEVO DISEÑO DEL PDF CON PDFKIT ---

        // Cargar logo de U-Power
        try {
            const upowerLogoPath = path.join(__dirname, '..', '..', 'img', 'logoUpower.png');
            const upowerLogoBytes = await fs.readFile(upowerLogoPath);
            // Dibujar el logo en ambas esquinas
            doc.image(upowerLogoBytes, 30, 25, { width: 80 });
            doc.image(upowerLogoBytes, doc.page.width - 110, 25, { width: 80 });
        } catch (e) {
            console.error("Fallo al cargar logoUpower.png:", e.message);
        }

        // Título y línea
        doc.fontSize(18).font('Helvetica-Bold').fillColor('red').text('RECLAMACION DE GARANTÍAS', 0, 35, { align: 'center' });
        doc.moveTo(20, 55).lineTo(doc.page.width - 20, 55).stroke();

        // Función para dibujar los campos
        const drawField = (label, value, x, y, labelWidth = 80, valueWidth = 180) => {
            doc.rect(x, y, labelWidth, 20).fillAndStroke('#EFEFEF', '#000000');
            doc.fontSize(10).font('Helvetica-Bold').fillColor('black').text(label, x + 5, y + 6, { lineBreak: false });
            doc.rect(x + labelWidth, y, valueWidth, 20).fillAndStroke('white', '#000000');
            doc.fontSize(10).font('Helvetica').fillColor('black').text(value || '', x + labelWidth + 5, y + 6, { lineBreak: false });
        };
        
        // Dibujar todos los campos en dos columnas
        drawField('FECHA', data.fecha, 30, 80);
        drawField('CLIENTE', data.cliente, 30, 100);

        drawField('AGENTE', data.agente, 310, 80);
        drawField('CONTACTO', data.contacto, 310, 100);

        drawField('MODELO', data.modelo, 30, 140);
        drawField('REF', data.referencia, 30, 160);
        drawField('TALLA', data.talla, 30, 180);

        // Descripción
        doc.rect(310, 140, 255, 60).stroke();
        doc.fontSize(9).font('Helvetica-Bold').text('DESCRIPCIÓN DEFECTO', 315, 128);
        doc.fontSize(10).font('Helvetica').text(data.motivoReclamacion, 315, 145, { width: 245, align: 'left' });

        // Gran recuadro gris para las fotografías
        const photoAreaX = 30;
        const photoAreaY = 220;
        const photoAreaWidth = doc.page.width - 60;
        const photoAreaHeight = 580;
        doc.rect(photoAreaX, photoAreaY, photoAreaWidth, photoAreaHeight).fillAndStroke('#EFEFEF', '#000000');
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#555555').text('INSERTAR FOTOGRAFÍAS', photoAreaX, photoAreaY + 20, { align: 'center' });

        // Posicionamiento de imágenes dentro del recuadro gris
        const imgWidth = (photoAreaWidth - 30) / 2;
        const imgHeight = imgWidth * 0.75;
        const imgStartX = photoAreaX + 10;
        const imgStartY = photoAreaY + 50;
        const imgMargin = 10;

        const drawImage = (file, x, y) => {
            if (file) {
                try {
                    doc.image(file.content, x, y, { fit: [imgWidth, imgHeight], align: 'center', valign: 'center' });
                } catch (imgError) {
                    console.error("Error incrustando imagen:", imgError.message);
                }
            }
        };

        drawImage(files.fotoParDelantero, imgStartX, imgStartY);
        drawImage(files.fotoParTrasero, imgStartX + imgWidth + imgMargin, imgStartY);
        drawImage(files.fotoDetalle, imgStartX, imgStartY + imgHeight + imgMargin);
        drawImage(files.fotoEtiqueta, imgStartX + imgWidth + imgMargin, imgStartY + imgHeight + imgMargin);

        doc.end();
    });
}
// --- FIN DE LA REESCRITURA DEL PDF ---


exports.handler = async function (event, context) {
    try {
        const { fields: data, files } = await parseMultipartForm(event);
        const pdfBytes = await generatePdf(data, files);
        const pdfBase64 = pdfBytes.toString('base64');
        const fileName = `Garantia_Upower_${data.cliente.replace(/ /g, '_')}_${data.fecha}.pdf`;

        const msg = {
            to: 'pablo@cvtools.es',
            from: 'pablo2vbngdaw@gmail.com',
            subject: `Nueva Garantía U-Power de: ${data.cliente}`,
            text: `Se ha recibido una nueva solicitud de garantía. Los detalles están en el PDF adjunto.\n\nCliente: ${data.cliente}\nContacto: ${data.contacto}`,
            attachments: [{ content: pdfBase64, filename: fileName, type: 'application/pdf', disposition: 'attachment' }],
        };
        if (data.email && data.email.includes('@')) {
            msg.cc = data.email;
        }

        await sgMail.send(msg);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Garantía enviada con éxito' }) };
    } catch (error) {
        console.error('Error en la función:', error.toString());
        return { statusCode: 500, body: JSON.stringify({ success: false, message: `Error en el servidor: ${error.message}` }) };
    }
};