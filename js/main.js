document.addEventListener('DOMContentLoaded', () => {
    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const confirmationContainer = document.getElementById('confirmationContainer');
    const form = document.getElementById('reclamacionForm');
    
    // Lógica de persistencia de datos (sin cambios)
    const fieldsToPersist = form.querySelectorAll('input[type="text"], input[type="email"], input[type="date"], input[type="tel"], textarea');
    const saveData = () => { try { fieldsToPersist.forEach(field => localStorage.setItem(field.id, field.value)); } catch (e) { console.error("No se pudo guardar en localStorage."); } };
    const loadData = () => { try { fieldsToPersist.forEach(field => { const savedValue = localStorage.getItem(field.id); if (savedValue) { field.value = savedValue; } }); } catch (e) { console.error("No se pudo leer de localStorage."); } };
    const clearData = () => { try { fieldsToPersist.forEach(field => localStorage.removeItem(field.id)); } catch (e) { console.error("No se pudo limpiar localStorage."); } };
    const allFormElements = form.querySelectorAll('input, textarea');
    allFormElements.forEach(element => element.addEventListener('change', saveData));
    loadData();

    // --- INICIO DE LA MODIFICACIÓN: Lógica de compresión de imágenes ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        formContainer.style.display = 'none';
        loadingContainer.style.display = 'block';

        // Opciones para la compresión de imágenes
        const options = {
            maxSizeMB: 1,          // Tamaño máximo de 1MB por imagen
            maxWidthOrHeight: 1920, // Redimensionar si es más grande de 1920px
            useWebWorker: true     // Usar Web Worker para no bloquear la interfaz
        };

        try {
            // 1. Recoger las imágenes originales
            const imageFiles = [
                { name: 'fotoParDelantero', file: form.fotoParDelantero.files[0] },
                { name: 'fotoParTrasero', file: form.fotoParTrasero.files[0] },
                { name: 'fotoDetalle', file: form.fotoDetalle.files[0] },
                { name: 'fotoEtiqueta', file: form.fotoEtiqueta.files[0] }
            ];

            // 2. Comprimir las imágenes que existan
            const compressionPromises = imageFiles
                .filter(item => item.file) // Solo procesar las que tienen un archivo
                .map(async (item) => {
                    console.log(`Comprimiendo ${item.file.name}...`);
                    const compressedFile = await imageCompression(item.file, options);
                    console.log(`Compresión de ${item.file.name} finalizada.`);
                    return { name: item.name, file: compressedFile, originalName: item.file.name };
                });

            const compressedImages = await Promise.all(compressionPromises);
            
            // 3. Crear un nuevo FormData con los datos y las imágenes comprimidas
            const finalFormData = new FormData();
            
            // Añadir los campos de texto
            for (const pair of new FormData(form).entries()) {
                if (pair[1] instanceof File === false) {
                    finalFormData.append(pair[0], pair[1]);
                }
            }

            // Añadir las imágenes comprimidas
            compressedImages.forEach(item => {
                // Es importante mantener el nombre original del archivo para el servidor
                finalFormData.append(item.name, item.file, item.originalName);
            });

            // 4. Enviar el formulario con los datos optimizados
            const response = await fetch('/.netlify/functions/procesarGarantia', {
                method: 'POST',
                body: finalFormData, // Usamos el nuevo FormData con las imágenes comprimidas
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Error desconocido en el servidor.');
            }
            
            clearData();
            loadingContainer.style.display = 'none';
            confirmationContainer.style.display = 'block';

        } catch (error) {
            console.error('Error al enviar el formulario:', error);
            alert(`Hubo un problema al enviar la reclamación: ${error.message}`);
            loadingContainer.style.display = 'none';
            formContainer.style.display = 'block';
        }
    });
    // --- FIN DE LA MODIFICACIÓN ---

    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => {
        clearData();
        window.location.reload();
    });

    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', (event) => {
            const successMessage = event.target.closest('.input-ejemplo').querySelector('.upload-success-message');
            successMessage.style.display = event.target.files.length > 0 ? 'inline' : 'none';
        });
    });
});