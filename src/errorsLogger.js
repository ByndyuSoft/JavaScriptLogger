'use strict';


var ErrorsLogger = function (options) {

	if (!options || !options.url) {
		return;
	}


	function extend() {
		if (arguments && arguments.length > 1) {
			for (var i = 1, len = arguments.length; i < len; i++) {
				for (var key in arguments[i]) {
					if (arguments[i].hasOwnProperty(key)) {
						arguments[0][key] = arguments[i][key];
					}
				}
			}
		}

		return arguments[0] || [];
	}



	/**
	 * AJAX POST отправитель
	 * @param data
	 * @returns {{success: success, error: error}}
	 */
	var xhrPost = function (data) {

		// преобразование данных в строку
		function getErrorsQueryString(errorsData) {
			var resultArray = [];

			for (var paramName in errorsData) {
				if (errorsData.hasOwnProperty(paramName)) {
					resultArray.push(paramName + '=' + encodeURIComponent(errorsData[paramName]));
				}
			}

			return resultArray.join('&');
		}

		var methods = {
				success: function () {
				},
				error: function () {
				}
			},
			XHR = window.XMLHttpRequest || ActiveXObject,
			request = new XHR('MSXML2.XMLHTTP.3.0');

		request.open('POST', options.url, true);
		request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

		request.onreadystatechange = function () {
			if (request.readyState === 4) {
				if (request.status >= 200 && request.status < 300) {
					methods.success.apply(methods, request);
				} else {
					methods.error.apply(methods, request);
				}
			}
		};

		request.send(getErrorsQueryString(data));

		var callbacks = {
			success: function (callback) {
				methods.success = callback;
				return callbacks;
			},
			error: function (callback) {
				methods.error = callback;
				return callbacks;
			}
		};

		return callbacks;
	};



	/**
	 * Хранилище ошибок
	 */
	var errorsStorage = new function () {
		var that = this,
			errorIndex = 0,			// номер зарегистрированной ошибки
			currentErrorIndex = 0,	// номер первой не отправленной ошибки
			storage = {};


		extend(this, {

			/**
			 * Проверка ошибки на принадлежность к игнорируемым ошибкам
			 * @param message
			 * @returns {boolean}
			 */
			isIgnoreError: function (data) {
				// "Script error." - забито в браузеры для ошибок, которые не могут быть прочитаны
				// это ошибки кроссдоменных запросов (CORS)
				return /^Script error\.?$/.test(data.message) || (/^Javascript error: Script error\./.test(data.message) && data.lineno == 0);
			},


			/**
			 * Запись ошибки в хранилище
			 * @param data
			 */
			write: function (data) {
				if (!this.isIgnoreError(data)) {
					storage[errorIndex] = extend({
						pageUrl: window.location.href,
						time: new Date().toString(),
						index: errorIndex
					}, options.additionalParams || {}, data);

					errorIndex++;
				}
			},


			/**
			 * Чтение всех записей-ошибок хранилища
			 * @returns {Array}
			 */
			read: function () {
				return storage[currentErrorIndex];
			},


			/**
			 * Удаление ошибки из хранилища
			 * @param key
			 */
			remove: function (key) {
				if (storage[key] !== undefined) {
					delete storage[key];
					currentErrorIndex++;
				}
			}
		});


		return {
			write: function (data) {
				that.write(data);
			},
			read: function () {
				return that.read();
			},
			remove: function (key) {
				that.remove(key);
			}
		};
	};


	/**
	 * Логгер
	 */
	var that = this;

	extend(this, {
		initialize: function () {
			// запуск обработки JS ошибок
			var oldOnError = window.onerror;

			window.onerror = function () {
				if(oldOnError) {
					oldOnError.apply(this, arguments);
				}

				that.addError.apply(that, arguments);
			};
		},


		/**
		 * Добавление JS ошибки в хранилище
		 * @param message
		 * @param source
		 * @param lineno
		 * @param rowno
		 */
		addError: function (message, source, lineno, rowno) {
			errorsStorage.write({
				message: message,
				source: source,
				lineno: lineno,
				rowno: rowno
			});

			this.sendToServer();
		},


		isSending: false,	// флаг отображает отправку ошибки в данный момент


		/**
		 * Отправка ошибок на сервер с последующим удалением их из хранилища ошибок
		 */
		sendToServer: function () {
			var errorsData = errorsStorage.read();

			// если происходит отправка ошибки или закончились ошибки в хранилище
			if (!errorsData || this.isSending) {
				return;
			}


			this.isSending = true;

			xhrPost(errorsData)
				.success(function () {
					// удаляем ошибку из хранилища
					errorsStorage.remove(errorsData.index);

					that.isSending = false;

					// отправляем следующую ошибку, если таковая есть в хранилище
					that.sendToServer();
				})
				.error(function () {
					that.isSending = false;

					// отправляем эту же ошибку повторно
					that.sendToServer();
				});
		}
	});


	this.initialize();

};