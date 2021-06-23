/**
 * Copyright (c) 1998-2017 NetSuite, Inc.
 * 2955 Campus Drive, Suite 100, San Mateo, CA, USA 94403-2511
 * All Rights Reserved.
 *
 * This software is the confidential and proprietary information of
 * NetSuite, Inc. ('Confidential Information'). You shall not
 * disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into
 * with NetSuite.
 *
 *
 * Version      Date            Author                Remarks
 * 1.00         8/13/2020       akhimani                 initial
 **/

/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/runtime'],
    /**
     * @param {record} record
     */
    function (record, runtime) {

        /**
         * Function definition to be triggered before record is loaded.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type
         * @param {Form} scriptContext.form - Current form
         * @Since 2015.2
         */
        function beforeLoad(context) {
            try {
                if (context.type == context.UserEventType.VIEW && runtime.executionContext == runtime.ContextType.USER_INTERFACE) {
                    var recDeposit = context.newRecord;

                    var stLogTitle = 'beforeLoad deposit button';
                    log.debug(stLogTitle, stLogTitle);
                    form = context.form;
                    form.clientScriptModulePath = './ns_cs_print_pdf_client.js';

                    form.addButton({
                        id: 'custpage_printdepositpdf',
                        label: 'Print Deposit Slip',
                        functionName: 'callSuitelet'
                    });

                }
            }

            catch (error) {
                log.error(stLogTitle + ' | ' + error.message);
            }
        }


        return {
            beforeLoad: beforeLoad
        };

    });
