const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const sgMail = require('@sendgrid/mail');
const busboy = require('busboy');
const fs = require('fs').promises;
const path = require('path');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Función para procesar el formulario (sin cambios en la lógica)
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

// Handler principal de la función
exports.handler = async function (event, context) {
    try {
        const { fields: data, files } = await parseMultipartForm(event);

        // --- INICIO DE LA GENERACIÓN DEL PDF PARA U-POWER ---
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Cargar logo de U-Power (asegúrate de que img/logoUpower.png existe)
        try {
            const logoPath = path.resolve(__dirname, '../../img/logoUpower.png');
            const upowerLogoBytes = await fs.readFile(logoPath);
            const upowerLogo = await pdfDoc.embedPng(upowerLogoBytes);
            page.drawImage(upowerLogo, { x: 30, y: height - 50, width: 80, height: 25 });
            page.drawImage(upowerLogo, { x: width - 110, y: height - 50, width: 80, height: 25 });
        } catch (e) {
            console.warn("logoUpower.png no encontrado.");
        }

        // Título del PDF
        page.drawText('RECLAMACION DE GARANTÍAS', {
            x: width / 2, y: height - 45, font: fontBold, size: 18, color: rgb(1, 0, 0), xAlign: 'center',
        });
        page.drawLine({
            start: { x: 20, y: height - 60 }, end: { x: width - 20, y: height - 60 }, thickness: 1,
        });

        // Función para dibujar campos con bordes
        const drawField = (label, value, x, y, labelWidth, valueWidth) => {
            page.drawRectangle({ x, y, width: labelWidth, height: 20, color: rgb(0.9, 0.9, 0.9), strokeColor: rgb(0, 0, 0), borderWidth: 0.5 });
            page.drawText(label, { x: x + 5, y: y + 6, font: fontBold, size: 10 });
            page.drawRectangle({ x: x + labelWidth, y, width: valueWidth, height: 20, strokeColor: rgb(0, 0, 0), borderWidth: 0.5 });
            page.drawText(value || '', { x: x + labelWidth + 5, y: y + 6, font, size: 10 });
        };

        // Rellenar campos del formulario en el PDF
        let yPos = height - 90;
        drawField('FECHA', data.fecha, 30, yPos, 80, 150);
        drawField('AGENTE', data.agente, 300, yPos, 80, 150);
        yPos -= 20;
        drawField('CLIENTE', data.cliente, 30, yPos, 80, 150);
        drawField('CONTACTO', data.contacto, 300, yPos, 80, 150);
        
        yPos -= 40;
        drawField('MODELO', data.modelo, 30, yPos, 80, 150);
        yPos -= 20;
        drawField('REF', data.referencia, 30, yPos, 80, 150);
        yPos -= 20;
        drawField('TALLA', data.talla, 30, yPos, 80, 150);

        // CORRECCIÓN: Dibujar el cuadro de descripción sin relleno negro
        const descX = 300;
        const descY = height - 130;
        const descWidth = 265;
        const descHeight = 110;
        page.drawRectangle({ x: descX, y: descY - descHeight, width: descWidth, height: descHeight, strokeColor: rgb(0, 0, 0), borderWidth: 0.5 });
        page.drawText('DESCRIPCIÓN DEFECTO', { x: descX + 5, y: descY + 5, font: fontBold, size: 9 });
        page.drawText(data.motivoReclamacion, { x: descX + 5, y: descY - 10, font, size: 10, lineHeight: 12, maxWidth: descWidth - 10 });

        // Añadir las 4 imágenes en una cuadrícula 2x2
        const imgWidth = (width - 60) / 2.2;
        const imgHeight = imgWidth * 0.75;
        const imgStartY = yPos - 180;
        const imgMargin = 15;

        const embedImage = async (file) => {
            if (!file) return null;
            if (file.contentType === 'image/jpeg') return await pdfDoc.embedJpg(file.content);
            if (file.contentType === 'image/png') return await pdfDoc.embedPng(file.content);
            return null;
        };
        
        const img1 = await embedImage(files.fotoParDelantero);
        if (img1) page.drawImage(img1, { x: 30, y: imgStartY, width: imgWidth, height: imgHeight });

        const img2 = await embedImage(files.fotoParTrasero);
        if (img2) page.drawImage(img2, { x: 30 + imgWidth + imgMargin, y: imgStartY, width: imgWidth, height: imgHeight });
        
        const img3 = await embedImage(files.fotoDetalle);
        if (img3) page.drawImage(img3, { x: 30, y: imgStartY - imgHeight - imgMargin, width: imgWidth, height: imgHeight });

        const img4 = await embedImage(files.fotoEtiqueta);
        if (img4) page.drawImage(img4, { x: 30 + imgWidth + imgMargin, y: imgStartY - imgHeight - imgMargin, width: imgWidth, height: imgHeight });
        // --- FIN DE LA GENERACIÓN DEL PDF ---

        const pdfBytes = await pdfDoc.save();
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        const fileName = `Garantia_Upower_${data.cliente.replace(/ /g, '_')}_${data.fecha}.pdf`;

        // Configuración del correo
        const msg = {
            to: ['cvtools@cvtools.es', 'pablo@cvtools.es'],
            from: 'formularios@cvtools.es',
            subject: `Nueva Garantía U-Power de: ${data.cliente}`,
            text: `Se ha recibido una nueva solicitud de garantía. Los detalles están en el PDF adjunto.\n\nCliente: ${data.cliente}\nContacto: ${data.contacto}`,
            attachments: [{ content: pdfBase64, filename: fileName, type: 'application/pdf', disposition: 'attachment' }],
        };
        if (data.email && data.email.includes('@')) {
            msg.cc = data.email;
        }

        await sgMail.send(msg);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Garantía enviada con éxito' }),
        };

    } catch (error) {
        console.error('Error en la función:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Error en el servidor: ${error.message}` }),
        };
    }
};