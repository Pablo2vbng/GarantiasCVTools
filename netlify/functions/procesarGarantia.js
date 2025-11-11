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

function generatePdf(data, files) {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Cargar logos de forma segura (no detendrá la ejecución si falla)
        try {
            const arroyoLogoPath = path.resolve(__dirname, '../img/logo.png');
            const arroyoLogoBytes = await fs.readFile(arroyoLogoPath);
            doc.image(arroyoLogoBytes, 30, 25, { width: 80 });
        } catch (e) {
            console.error("Fallo al cargar logo.png:", e.message);
            doc.fontSize(8).text("Logo Arroyo no encontrado", 30, 35);
        }

        try {
            const upowerLogoPath = path.resolve(__dirname, '../img/logoUpower.png');
            const upowerLogoBytes = await fs.readFile(upowerLogoPath);
            doc.image(upowerLogoBytes, doc.page.width - 110, 25, { width: 80 });
        } catch (e) {
            console.error("Fallo al cargar logoUpower.png:", e.message);
            doc.fontSize(8).text("Logo U-Power no encontrado", doc.page.width - 110, 35);
        }

        doc.fontSize(18).font('Helvetica-Bold').fillColor('red').text('RECLAMACION DE GARANTÍAS', 0, 35, { align: 'center' });
        doc.moveTo(20, 55).lineTo(doc.page.width - 20, 55).stroke();

        const drawField = (label, value, x, y, labelWidth = 80, valueWidth = 150) => {
            doc.rect(x, y, labelWidth, 20).fillAndStroke('#EFEFEF', '#000000');
            doc.fontSize(10).font('Helvetica-Bold').fillColor('black').text(label, x + 5, y + 6, { lineBreak: false });
            doc.rect(x + labelWidth, y, valueWidth, 20).fillAndStroke('white', '#000000');
            doc.fontSize(10).font('Helvetica').fillColor('black').text(value || '', x + labelWidth + 5, y + 6, { lineBreak: false });
        };
        
        drawField('FECHA', data.fecha, 30, 80);
        drawField('AGENTE', data.agente, 300, 80);
        drawField('CLIENTE', data.cliente, 30, 100);
        drawField('CONTACTO', data.contacto, 300, 100);
        drawField('MODELO', data.modelo, 30, 140);
        drawField('REF', data.referencia, 30, 160);
        drawField('TALLA', data.talla, 30, 180);

        doc.rect(300, 140, 265, 100).stroke();
        doc.fontSize(9).font('Helvetica-Bold').text('DESCRIPCIÓN DEFECTO', 305, 128);
        doc.fontSize(10).font('Helvetica').text(data.motivoReclamacion, 305, 145, { width: 255, align: 'left' });

        const imgWidth = (doc.page.width - 90) / 2;
        const imgHeight = imgWidth * 0.75;
        const imgStartY = 260;
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

        drawImage(files.fotoParDelantero, 30, imgStartY);
        drawImage(files.fotoParTrasero, 30 + imgWidth + imgMargin, imgStartY);
        drawImage(files.fotoDetalle, 30, imgStartY + imgHeight + imgMargin);
        drawImage(files.fotoEtiqueta, 30 + imgWidth + imgMargin, imgStartY + imgHeight + imgMargin);

        doc.end();
    });
}

exports.handler = async function (event, context) {
    try {
        const { fields: data, files } = await parseMultipartForm(event);
        const pdfBytes = await generatePdf(data, files);
        const pdfBase64 = pdfBytes.toString('base64');
        const fileName = `Garantia_Upower_${data.cliente.replace(/ /g, '_')}_${data.fecha}.pdf`;

        // --- INICIO DE LOS CAMBIOS DE CORREO ---
        const msg = {
            to: 'pablo@cvtools.es',               // Nuevo destinatario
            from: 'pablo2vbngdaw@gmail.com',         // Nuevo remitente (¡DEBES VERIFICARLO!)
            subject: `Nueva Garantía U-Power de: ${data.cliente}`,
            text: `Se ha recibido una nueva solicitud de garantía. Los detalles están en el PDF adjunto.\n\nCliente: ${data.cliente}\nContacto: ${data.contacto}`,
            attachments: [{ content: pdfBase64, filename: fileName, type: 'application/pdf', disposition: 'attachment' }],
        };
        if (data.email && data.email.includes('@')) {
            msg.cc = data.email; // Se mantiene la copia al cliente
        }
        // --- FIN DE LOS CAMBIOS DE CORREO ---

        await sgMail.send(msg);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Garantía enviada con éxito' }) };
    } catch (error) {
        console.error('Error en la función:', error.toString());
        return { statusCode: 500, body: JSON.stringify({ success: false, message: `Error en el servidor: ${error.message}` }) };
    }
};