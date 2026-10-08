package org.tinybits.joinsplit;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String HANDLE_WEB_BACK =
        "(() => {" +
        "if (window.location.pathname === '/') return false;" +
        "if (window.history.length > 1) window.history.back();" +
        "else window.location.assign('/');" +
        "return true;" +
        "})()";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    leaveApplication(this);
                    return;
                }

                getBridge().getWebView().evaluateJavascript(HANDLE_WEB_BACK, handled -> {
                    if (!"true".equals(handled)) leaveApplication(this);
                });
            }
        });
    }

    private void leaveApplication(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
    }
}
