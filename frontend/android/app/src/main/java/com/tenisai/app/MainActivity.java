package com.tenisai.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) {
            // El móvil no tiene WebView: Capacitor ya muestra su aviso
            return;
        }
        bridge.setWebViewClient(new ClienteWeb(bridge));

        // Atrás: vuelve a la página anterior de la web; en la primera, deja la app en segundo
        // plano, como cualquier app de Android
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge.getWebView();
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    /**
     * Página de sin conexión (server.errorPath, movil/www/sin-conexion.html):
     * - solo cuando no hay red o el servidor no responde; la web ya tiene sus propias páginas
     *   de error (404, 500), que se muestran tal cual;
     * - su botón "Reintentar" abre https://localhost/reintentar, que aquí vuelve a cargar la
     *   página que falló (la de sin conexión no puede saber cuál era ni la dirección de la web).
     */
    private static class ClienteWeb extends BridgeWebViewClient {

        private static final String HOST_LOCAL = "localhost";
        private static final String RUTA_REINTENTAR = "/reintentar";

        private final Bridge bridge;
        private String paginaFallida;

        ClienteWeb(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST_LOCAL.equals(url.getHost()) && RUTA_REINTENTAR.equals(url.getPath())) {
                view.loadUrl(paginaFallida != null ? paginaFallida : bridge.getAppUrl());
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                paginaFallida = request.getUrl().toString();
            }
            super.onReceivedError(view, request, error);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            int estado = errorResponse.getStatusCode();
            boolean servidorCaido = estado == 502 || estado == 503 || estado == 504;
            if (request.isForMainFrame() && !servidorCaido) {
                return;
            }
            if (request.isForMainFrame()) {
                paginaFallida = request.getUrl().toString();
            }
            super.onReceivedHttpError(view, request, errorResponse);
        }
    }
}
