//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Nils Krüger on 23.10.26.
//

import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        // All functionality lives in the web extension. No native messages or data collection.
        context.completeRequest(returningItems: nil, completionHandler: nil)
    }

}
