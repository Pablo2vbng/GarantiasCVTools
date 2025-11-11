const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
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

exports.handler = async function (event, context) {
    try {
        const { fields: data, files } = await parseMultipartForm(event);

        // --- INICIO DE LA MODIFICACIÓN DEL PDF ---
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Cargar logo de U-Power (asegúrate de que img/upower.png existe)
        let upowerLogoBytes;
        try {
            const logoPath = path.resolve(__dirname, '../../img/upower.png');
            upowerLogoBytes = await fs.readFile(logoPath);
        } catch (e) {
            console.warn("Logo upower.png no encontrado.");
        }

        if (upowerLogoBytes) {
            const upowerLogo = await pdfDoc.embedPng(upowerLogoBytes);
            page.drawImage(upowerLogo, { x: 30, y: height - 50, width: 80, height: 25 });
            page.drawImage(upowerLogo, { x: width - 110, y: height - 50, width: 80, height: 25 });
        }

        // Título
        page.drawText('RECLAMACION DE GARANTÍAS', {
            x: width / 2,
            y: height - 45,
            font: fontBold,
            size: 18,
            color: rgb(1, 0, 0),
            xAlign: 'center',
        });
        page.drawLine({
            start: { x: 20, y: height - 60 },
            end: { x: width - 20, y: height - 60 },
            thickness: 1,
            color: rgb(0, 0, 0),
        });

        // Función para dibujar los campos
        const drawField = (label, value, x, y, labelWidth, valueWidth) => {
            // Label Box (grey)
            page.drawRectangle({ x, y, width: labelWidth, height: 20, color: rgb(0.9, 0.9, 0.9), strokeColor: rgb(0, 0, 0), borderWidth: 0.5 });
            page.drawText(label, { x: x + 5, y: y + 6, font: fontBold, size: 10 });
            // Value Box (white)
            page.drawRectangle({ x: x + labelWidth, y, width: valueWidth, height: 20, color: rgb(1, 1, 1), strokeColor: rgb(0, 0, 0), borderWidth: 0.5 });
            page.drawText(value || '', { x: x + labelWidth + 5, y: y + 6, font, size: 10 });
        };

        let yPos = height - 90;
        // Columna 1
        drawField('FECHA', data.fecha, 30, yPos, 80, 150);
        yPos -= 20;
        drawField('CLIENTE', data.empresa, 30, yPos, 80, 150);
        
        // Columna 2
        yPos = height - 90;
        drawField('AGENTE', 'Representaciones Arroyo', 300, yPos, 80, 150);
        yPos -= 20;
        drawField('CONTACTO', data.contacto, 300, yPos, 80, 150);

        yPos -= 40;
        // Campos de producto
        drawField('MODELO', data.factura, 30, yPos, 80, 150); // Usamos el campo factura como "Modelo/Factura"
        yPos -= 20;
        drawField('REF', data.referencia, 30, yPos, 80, 150);
        yPos -= 20;
        drawField('TALLA', data.telefono, 30, yPos, 80, 150); // Usamos el campo teléfono como "Talla/Teléfono"
        
        // Descripción del defecto
        yPos = height - 130;
        page.drawRectangle({ x: 300, y: yPos - 100, width: 250, height: 100, strokeColor: rgb(0, 0, 0), borderWidth: 0.5 });
        page.drawText('DESCRIPCIÓN DEFECTO', { x: 305, y: yPos + 5, font: fontBold, size: 9 });
        page.drawText(data.defecto, { x: 305, y: yPos - 10, font, size: 10, lineHeight: 12, maxWidth: 240 });
        
        // Añadir imágenes
        yPos -= 120;
        if (files.fotoDelantera) {
            let img;
            if (files.fotoDelantera.contentType === 'image/jpeg') img = await pdfDoc.embedJpg(files.fotoDelantera.content);
            else if (files.fotoDelantera.contentType === 'image/png') img = await pdfDoc.embedPng(files.fotoDelantera.content);
            if (img) page.drawImage(img, { x: 50, y: yPos - 150, width: 200, height: 150 });
        }
        if (files.fotoTrasera) {
            let img;
            if (files.fotoTrasera.contentType === 'image/jpeg') img = await pdfDoc.embedJpg(files.fotoTrasera.content);
            else if (files.fotoTrasera.contentType === 'image/png') img = await pdfDoc.embedPng(files.fotoTrasera.content);
            if (img) page.drawImage(img, { x: 300, y: yPos - 150, width: 200, height: 150 });
        }
        // --- FIN DE LA MODIFICACIÓN DEL PDF ---

        const pdfBytes = await pdfDoc.save();
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        const fileName = `Reclamacion_${data.empresa.replace(/ /g, '_')}_${data.fecha}.pdf`;

        // --- CAMBIO: AÑADIR EMAIL DEL CLIENTE EN COPIA (CC) ---
        const msg = {
            to: ['cvtools@cvtools.es', 'pablo@cvtools.es'],
            from: 'formularios@cvtools.es', 
            subject: `Nueva Reclamación de: ${data.empresa}`,
            text: `Se ha recibido una nueva reclamación. Los detalles están en el PDF adjunto.\n\nEmpresa: ${data.empresa}\nContacto: ${data.contacto}`,
            attachments: [{ content: pdfBase64, filename: fileName, type: 'application/pdf', disposition: 'attachment' }],
        };

        // Añadimos el campo CC solo si el email es válido
        if (data.email && data.email.includes('@')) {
            msg.cc = data.email;
        }

        await sgMail.send(msg);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Reclamación enviada con éxito' }),
        };

    } catch (error) {
        console.error('Error en la función:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Error en el servidor: ${error.message}` }),
        };
    }
};