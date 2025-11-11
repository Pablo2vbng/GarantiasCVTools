document.addEventListener('DOMContentLoaded', () => {
    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const confirmationContainer = document.getElementById('confirmationContainer');
    const form = document.getElementById('reclamacionForm');

    // --- INICIO DE LA LÓGICA DE PERSISTENCIA (CORREGIDA Y COMPLETA) ---
    const fieldsToPersist = form.querySelectorAll('input[type="text"], input[type="email"], input[type="date"], input[type="tel"], textarea');

    const saveData = () => {
        try {
            fieldsToPersist.forEach(field => {
                localStorage.setItem(field.id, field.value);
            });
        } catch (e) {
            console.error("No se pudo guardar en localStorage.");
        }
    };

    const loadData = () => {
        try {
            fieldsToPersist.forEach(field => {
                const savedValue = localStorage.getItem(field.id);
                if (savedValue) {
                    field.value = savedValue;
                }
            });
        } catch (e) {
            console.error("No se pudo leer de localStorage.");
        }
    };
    
    const clearData = () => {
        try {
            fieldsToPersist.forEach(field => {
                localStorage.removeItem(field.id);
            });
        } catch (e) {
            console.error("No se pudo limpiar localStorage.");
        }
    };

    const allFormElements = form.querySelectorAll('input, textarea');
    allFormElements.forEach(element => {
        element.addEventListener('change', saveData);
    });

    loadData();
    // --- FIN DE LA LÓGICA DE PERSISTENCIA ---

    // --- LÓGICA DE COMPRESIÓN DE IMÁGENES Y ENVÍO ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        formContainer.style.display = 'none';
        loadingContainer.style.display = 'block';

        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true
        };

        try {
            const imageFiles = [
                { name: 'fotoParDelantero', file: form.fotoParDelantero.files[0] },
                { name: 'fotoParTrasero', file: form.fotoParTrasero.files[0] },
                { name: 'fotoDetalle', file: form.fotoDetalle.files[0] },
                { name: 'fotoEtiqueta', file: form.fotoEtiqueta.files[0] }
            ];

            const compressionPromises = imageFiles
                .filter(item => item.file)
                .map(async (item) => {
                    const compressedFile = await imageCompression(item.file, options);
                    return { name: item.name, file: compressedFile, originalName: item.file.name };
                });

            const compressedImages = await Promise.all(compressionPromises);
            
            const finalFormData = new FormData();
            
            for (const pair of new FormData(form).entries()) {
                if (pair[1] instanceof File === false) {
                    finalFormData.append(pair[0], pair[1]);
                }
            }

            compressedImages.forEach(item => {
                finalFormData.append(item.name, item.file, item.originalName);
            });

            const response = await fetch('/.netlify/functions/procesarGarantia', {
                method: 'POST',
                body: finalFormData,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Error desconocido en el servidor.');
            }
            
            // Si el envío es exitoso, borramos los datos del localStorage
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

    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => {
        // Al empezar de nuevo, también borramos los datos
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