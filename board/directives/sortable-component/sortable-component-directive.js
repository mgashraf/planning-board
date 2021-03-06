/*
 (c) Copyright 2016 Hewlett Packard Enterprise Development LP

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

(function () {
	'use strict';
	var module = angular.module('platform-board');

	module.directive('sortableComponent', /*@ngInject*/ function ($rootScope, $timeout, $document, $window, dragContainerDomUtils, dragContainerCalculationUtils) {
		return {
			restrict: 'AE',
			link: function (scope, element, attr) {
				var DraggableElementSelector = 'draggable-element', debug = false;

				// Hard coded values: those values should be overriden by the user.
				var _hardCodedTemplate = '<div>WARING: drop dummy template missing</div>',
					_hardCodedDummyStyle = 'drag-directive-element-dummy',
					_hardCodedDummyAreaStyle = 'drag-directive-element-dummy-area',
					_hardCodedContainterStyle = 'drag-directive-element-container',
					_hardCodedContainterOverStyle = 'over';
				var EPSILON = 1;

				// Get user params or use hard-coded value
				var _codeTemplate = angular.isFunction(scope.getDummyTemplate) ? scope.getDummyTemplate() : _hardCodedTemplate,
					_dummyStyle = attr.dragDirectiveDummyStyle || _hardCodedDummyStyle,
					_dummyAreaStyle = attr.dragDirectiveDummyAreaStyle || _hardCodedDummyAreaStyle,
					_containterStyle = attr.dragDirectiveContainerStyle || _hardCodedContainterStyle,
					_containterOverStyle = attr.dragDirectiveContainerOverStyle || _hardCodedContainterOverStyle,
					_dragDirectiveModeArea = attr.dragDirectiveMode === 'drop-area',
					_dragToggledModeActive = attr.dragToggledModeActive;
				//$window.console.log('_dragDirectiveMode', _dragDirectiveModeArea);

				// Additional parameters
				var cardRectArray = [], rowsTopEnd = [], isInsideContainer, moveToPosition, dummyRect, dummy, dragStarted, mainSelectedCardElement, initialMouseDownPageX,
					markedDisabledItems, initialMouseDownPageY, dummYComputedStyle, contRect, contRectWithDummy, containerParentRect, cardRectFirst,
					cardRectLast, cardRectFirstWithDummy, cardRectFirstCurrent, marginYoffset, marginYcollapsedSize, limitsRectangle, dummyPosition = -1, prevPos = -1, scrollTop,
					indexSelectedDraggedCard;

				element.addClass(_containterStyle);

				function setDragDirectiveModeArea(mode) {
					//$window.console.log('setDragDirectiveModeArea', mode);
					_dragDirectiveModeArea = mode;

					if (mode) {
						dummy.setAttribute('class', _dummyAreaStyle);
					} else {
						dummy.setAttribute('class', _dummyStyle);
					}
					dummYComputedStyle = $window.getComputedStyle(dummy);
					actualVirtualDragDataCreate();
				}

				scope.$on('$destroy', function () {
					watchDragElementContainerParent();
				});
				function actualVirtualDragDataCreate() {
					//$window.console.log('initiateVirtualDragData', scope.column.id);

					//$window.console.log('initiateVirtualDragData', isInsideContainer);
					//moveToPosition = {};

					//$window.console.log('rebuildCache');
					cardRectArray = [];
					if (scope.dragElementContainerParent) {
						var elem = scope.dragElementContainerParent;
						var elementToRemove;
						if (Array.isArray(scope.dragElementContainerParent) && scope.dragElementContainerParent.length > 0) {
							elem = scope.dragElementContainerParent[0];
							containerParentRect = dragContainerDomUtils.getfixedRectHeight(elem, true, false);
							if (scope.dragElementContainerParent.length > 1) {
								elementToRemove = dragContainerDomUtils.getfixedRectHeight(scope.dragElementContainerParent[1], true, false);
								containerParentRect.top = elementToRemove.top + elementToRemove.height;
								containerParentRect.height -= elementToRemove.height;
							}
						} else {
							containerParentRect = dragContainerDomUtils.getfixedRectHeight(elem, true, false);
						}
					}
					if (_dragDirectiveModeArea) {
						if (!isInsideContainer) {
							dummy.style.display = 'none';
						}
						contRect = dragContainerDomUtils.getfixedRectHeight(element[0]);
						contRectWithDummy = contRect;
						//dummyPosition = -1;
						prevPos = -dummyPosition;
						limitsRectangle = contRect;
						adjustDummySize();
						markCardItemsAsDisabled();
						return;
					}
					var cards = element[0].getElementsByClassName(DraggableElementSelector);
					if (isInsideContainer) {
						dummy.style.display = 'inline-block';
						dummy.style.top = '0px';
					}

					dummyRect = dragContainerDomUtils.getfixedRectHeight(dummy);
					if (cards.length > 0) {
						cardRectLast = dragContainerDomUtils.getfixedRectHeight(cards[cards.length - 1], false, true);

						//not attached
						if (!cardRectLast) {
							return;
						}

						//dummy needs to be at the end of list
						//in order to create correct offset for firstRect
						if (!isInsideContainer && dummyRect.top < cardRectLast.top) {
							element[0].appendChild(dummy);
						}
						//cardRectFirstWithDummy = dragContainerDomUtils.getfixedRectHeight(cards[0], false, true);
					}

					contRectWithDummy = dragContainerDomUtils.getfixedRectHeight(element[0]);

					//dummy.style.display = 'none';
					contRect = dragContainerDomUtils.getfixedRectHeight(element[0]);

					if (cards.length > 0) {
						cardRectFirst = dragContainerDomUtils.getfixedRectHeight(cards[0], false, true);

						//cardRectLast.top position used to check card cosistancy
						//cardRectLast.height used for card height calculation
						cardRectLast = dragContainerDomUtils.getfixedRectHeight(cards[cards.length - 1], false, true);
						//cardRectFirstCurrent = cardRectFirst;
						createRects(cards);
						findDummyRectRow();
						//if (!isInsideContainer) {
						//	dummy.style.display = 'inline-block';
						//}
					}
					//dummyPosition = -1;
					prevPos = -dummyPosition;
					limitsRectangle = contRect;
					markCardItemsAsDisabled();
				}

				if (debug) {
					dragContainerDomUtils.initDebug();
				}

				function isCacheChanged() {
					var cards = element[0].getElementsByClassName(DraggableElementSelector);
					var containerRect = dragContainerDomUtils.getfixedRectHeight(element[0]);
					var compareRect = (dummYComputedStyle.display === 'none' ? contRect : contRectWithDummy);
					return !cardRectArray || cards.length !== cardRectArray.length || !dragContainerCalculationUtils.compareRectangles(containerRect, compareRect);
				}

				function initiateVirtualDragData() {
					scrollTop = ($window.pageYOffset || $document[0].documentElement.scrollTop);
					if (isCacheChanged()) {
						//initializingVirtualDragData = true;
						actualVirtualDragDataCreate();
					}
				}

				function createRects(cards) {
					//marginYoffset = Math.min(cardRectFirst.marginBottom, cardRectLast.marginTop);
					marginYcollapsedSize = Math.max(cardRectFirst.marginBottom, cardRectLast.marginTop) / 2;
					var isRepeatable = true;//Math.abs(cardRectFirst.height - cardRectLast.height) < EPSILON && Math.abs(cardRectLast.top - ((cardRectLast.height - marginYoffset) * (cards.length - 1) + cardRectFirst.top)) < EPSILON;

					//$window.console.log(cardRectFirst, cardRectLast, cardRectLast.top, cardRectLast.height - marginYoffset, (cards.length - 1), (cardRectLast.height - marginYoffset) * (cards.length - 1) + cardRectFirst.top, scope.column.id);
					if (isRepeatable) {
						for (var i = 0; i < cards.length; i++) {
							var r = Object.create(cardRectFirst);
							r.card = cards[i];
							r.disabled = cards[i].classList.contains('disabled');
							cardRectArray.push(r);
						}
						resetCards(cardRectArray);
					} else {
						//
						var testArr = [];
						cards = element[0].getElementsByClassName(DraggableElementSelector);
						for (var j = 0; j < cards.length; j++) {
							var fixedRectHeight = dragContainerDomUtils.getfixedRectHeight(cards[j]);
							fixedRectHeight.offsetHeight = cards[j].offsetHeight;
							fixedRectHeight.clientHeight = cards[j].clientHeight;
							testArr.push(fixedRectHeight);
						}
						//$window.console.log(testArr);
						throw new Error('not same size cards!');
					}
					//dummyRect.topStart = dummyRect.top;
					dummyRect.topEnd = dummyRect.top + dummyRect.height;
					dummyRect.leftEnd = dummyRect.left + dummyRect.width;
				}

				function resetCards(cards) {
					var marginYcollapsedSize = Math.max(cardRectFirst.marginBottom, cardRectLast.marginTop) / 2;
					rowsTopEnd = [];
					for (var i = 0; i < cards.length; i++) {
						var r = cards[i];

						var fixedCardRect = dragContainerDomUtils.getfixedRectHeight(r.card, false, true);
						//actoual start according to margin collapse
						//r.top = i * (cardRectLast.height - marginYoffset) + cardRectFirst.top;
						r.top = fixedCardRect.top;
						//visual middle poin between cards
						//r.topStart = r.top - (i === 0 ? 0 : (-marginYoffset + marginYcollapsedSize));
						//var topHeight = r.height - r.marginTop - r.marginBottom + marginYcollapsedSize * 2;
						//if (i === 0 && cards.length === 1) {
						//	topHeight = r.height;
						//} else if (i === 0) {
						//	topHeight = r.height - r.marginBottom + marginYcollapsedSize;
						//} else if (i === cards.length - 1) {
						//	topHeight = r.height - r.marginTop + marginYcollapsedSize;
						//}
						////r.topEnd = r.topStart + topHeight;

						r.height = fixedCardRect.height;
						r.width = fixedCardRect.width;
						r.innerHeight = fixedCardRect.innerHeight;
						r.innerWidth = fixedCardRect.innerWidth;
						r.topEnd = r.top + fixedCardRect.height;
						r.left = fixedCardRect.left;
						r.leftEnd = r.left + r.width;
						r.marginBottom = fixedCardRect.marginBottom;
						r.marginTop = fixedCardRect.marginTop;
						r.marginLeft = fixedCardRect.marginLeft;
						r.marginRight = fixedCardRect.marginRight;

						if (i === 0) {
							r.row = 0;
							rowsTopEnd.push(r.topEnd);
						} else {
							if ((cardRectArray[i - 1].top === r.top) && (cardRectArray[i - 1].leftEnd + r.width <= (limitsRectangle.left + limitsRectangle.width))) {
								r.row = cardRectArray[i - 1].row;
								if (r.topEnd > rowsTopEnd[r.row]) {
									rowsTopEnd[r.row] = r.topEnd;
								}
							} else {
								r.row = cardRectArray[i - 1].row + 1;
								rowsTopEnd.push(r.topEnd);
							}
						}
					}
				}

				scope.$on('ngRepeatFinished', function (e) {
					e.stopPropagation();
					initiateVirtualDragDataDebounce();
				});
				var initiateVirtualDragDataDebounce = dragContainerDomUtils.debounce(initiateVirtualDragData, 200);
				scope.$on('draggableComponentRefresh', initiateVirtualDragDataDebounce);

				//TODO: fire event when no ng repeat
				initiateVirtualDragDataDebounce();
				var watchDragElementContainerParent = scope.$watch('dragElementContainerParent', initiateVirtualDragDataDebounce);
				scope.$on('draggableComponentMarkCardDisabled', function (e, data) {

					markedDisabledItems = data.items;
					markCardItemsAsDisabled();

					//dragContainerCalculationUtils.printArrayUtil(cardRectArray,dummyRect);
				});
				function markCardItemsAsDisabled() {
					if (!markedDisabledItems) {
						return;
					}
					for (var i = 0; i < cardRectArray.length; i++) {
						cardRectArray[i].disabled = false;
					}
					for (i = 0; i < markedDisabledItems.length; i++) {
						if (markedDisabledItems[i] >= 0 && markedDisabledItems[i] < cardRectArray.length) {
							cardRectArray[markedDisabledItems[i]].disabled = true;
							indexSelectedDraggedCard = markedDisabledItems[i];
						}
					}
				}

				$document[0].addEventListener('scroll', initiateVirtualDragData, true);

				var getPayloadData = function () {
					return scope.getDragPayloadData();
				};
				scope.cardElementGetter = function (i) {
					var el = element.find('.' + DraggableElementSelector + '[index=' + i + ']')[0];
					return el;
				};

				function handleMoveAction(pageX, pageY) {
					//TODO: protect from empty cell containers (no card elements elements)
					if (!limitsRectangle) {
						return;
					}
					if (dragContainerCalculationUtils.isInsideCurrentElementLimits(pageX, pageY, limitsRectangle, containerParentRect)) {
						if (!isInsideContainer) {
							dummyPosition = cardRectArray.length * 2 + 2;
							prevPos = -dummyPosition;
							fireEnterContainerEvent();
							dummyRect = dragContainerDomUtils.getfixedRectHeight(dummy);
							//dummyRect.topStart = dummyRect.top;
							dummyRect.topEnd = dummyRect.top + dummyRect.height;
							dummyRect.leftEnd = dummyRect.left + dummyRect.width;
						}
						var deepSearch = false;
						if (!_dragDirectiveModeArea && dragContainerCalculationUtils.isInsideDummyLimits(pageY, _dragDirectiveModeArea ? 0 : dummyRect.topEnd)) {
							//$window.console.log('isInsideDummyLimits');
							//prevPos; //=dummyPosition;
							var temp = 1 + 2;
						} else if (dragContainerCalculationUtils.isInsideCurrentElementUpperLimits(pageY, cardRectArray, _dragDirectiveModeArea ? 0 : dummyRect.topEnd)) {
							//$window.console.log('isInsideCurrentElementUpperLimits ' + prevPos + ' : ' + dummyPosition);
							prevPos = 0;

							// $window.console.log('isInsideCurrentElementUpperLimits ' + prevPos + ' : ' + dummyPosition);
						} else if (dragContainerCalculationUtils.isInsideCurrentElementLowerLimits(pageY, cardRectArray, _dragDirectiveModeArea ? 0 : dummyRect.topEnd)) {

							prevPos = cardRectArray.length;

							// $window.console.log('isInsideCurrentElementLowerLimits ' + prevPos + ' : ' + dummyPosition);
						} else if (!_dragDirectiveModeArea) {
							for (var i = 0; i < cardRectArray.length; i++) {
								if (dragContainerCalculationUtils.isInsideCurrentCardUpperLimits(pageY, cardRectArray[i])) {
									prevPos = i;

									//$window.console.log('isInsideCurrentCardUpperLimits');
									if (dragContainerCalculationUtils.isElementAndSiblingDisabled(cardRectArray, i, true)) {
										deepSearch = true;
									}
								} else if (dragContainerCalculationUtils.isInsideCurrentCardLowerLimits(pageY, cardRectArray[i])) {
									prevPos = i + 1;
									if (dragContainerCalculationUtils.isElementAndSiblingDisabled(cardRectArray, i, false)) {
										prevPos = i;
										deepSearch = true;
									}
									//$window.console.log('isInsideCurrentCardLowerLimits');
								}
							}
						}
						isInsideContainer = true;
						deepSearch = true;
						if (deepSearch) {
							//$window.console.log('deepSearch', prevPos);
							//prevPos = dragContainerCalculationUtils.findBestPosition(cardRectArray, prevPos, dummyPosition);
							var isMoreThanOneCardInRowCell = dragContainerCalculationUtils.isMoreThanOneCardInRowCell(cardRectArray, dummyRect, limitsRectangle);
							if (isMoreThanOneCardInRowCell) {
								prevPos = dragContainerCalculationUtils.findBestPositionAccordingSides(cardRectArray, pageX, pageY);
							} else {
								prevPos = dragContainerCalculationUtils.findBestPositionAccordingHeight(cardRectArray, pageX, pageY);
							}

							
							if (prevPos === -1) {
								prevPos = dummyPosition;
							}

							//$window.console.log('deepSearch', prevPos);
						}
						if (prevPos !== dummyPosition && prevPos >= 0) {
							dummyPosition = prevPos;

							//$window.console.log(prevPos);
							if (!_dragDirectiveModeArea) {
								recalculateCardsDimensionsAccordingToDummy(dummyPosition);
								recalculateCardsTopHeight();
								checkToRepositionDummy(dummyPosition);
								createDropMoveData(dummyPosition);
							} else {
								moveToPosition = {};
							}
						}
					} else {
						if (isInsideContainer) {
							moveToPosition = {};
							isInsideContainer = false;
							dummyPosition = cardRectArray.length;
							prevPos = -dummyPosition;
							if (!_dragDirectiveModeArea) {
								recalculateCardsDimensionsAccordingToDummy(dummyPosition, pageX, pageY);
								checkToRepositionDummy(dummyPosition);
							}
							fireLeaveContainerEvent();
						}
					}
					if (debug) {
						dragContainerDomUtils.drawCanvasVisualisation(pageX, pageY, limitsRectangle, cardRectArray, dummyRect, isInsideContainer);
					}
				}

				function findDummyRectRow() {
					dummyRect.row = -1;
					for (var i = 0; i < cardRectArray.length; i++) {
						var r = cardRectArray[i];
						var epsilon = r.marginTop;
						if (Math.abs(dummyRect.top - r.top) <= epsilon) {
							dummyRect.row = r.row;
							return;
						}
					}
					if (dummyRect.row < 0 && i > 0) {
						dummyRect.row = cardRectArray[i - 1].row + 1;
					}
				}

				function recalculateCardsTopHeight() {
					rowsTopEnd = [];
					dummyRect.row = -1;
					for (var i = 0; i < cardRectArray.length; i++) {
						var r = cardRectArray[i];
						var epsilon = r.marginTop;
						if (i === 0) {
							r.row = 0;
							rowsTopEnd.push(r.topEnd);
						} else {
							if ((Math.abs(cardRectArray[i - 1].top - r.top) <= epsilon) && (cardRectArray[i - 1].leftEnd + r.width <= (limitsRectangle.left + limitsRectangle.width))) {
								r.row = cardRectArray[i - 1].row;
								if (r.topEnd > rowsTopEnd[r.row]) {
									rowsTopEnd[r.row] = r.topEnd;
								}
							} else {
								r.row = cardRectArray[i - 1].row + 1;
								rowsTopEnd.push(r.topEnd);
							}
						}
						if (Math.abs(dummyRect.top - r.top) <= epsilon) {
							dummyRect.row = r.row;
							if (dummyRect.topEnd > rowsTopEnd[dummyRect.row]) {
								rowsTopEnd[dummyRect.row] = dummyRect.topEnd;
							}
						}
					}
					if (dummyRect.row < 0 && i > 0) {
						dummyRect.row = cardRectArray[i - 1].row + 1;
					}
					var changedRowTopEnd = -1;
					for (var j = 0; j < cardRectArray.length; j++) {
						var c = cardRectArray[j];
						if (c.row > 0) {
							if (changedRowTopEnd !== c.row) {
								changedRowTopEnd = -1;
							}
							var tempTop = c.top;
							c.top = rowsTopEnd[c.row - 1];
							if (c.top !== tempTop && changedRowTopEnd !== c.row) {
								rowsTopEnd[c.row] += (c.top - tempTop);
								changedRowTopEnd = c.row;
								if (dummyRect.row === c.row) {
									dummyRect.top = rowsTopEnd[c.row - 1];
									//dummyRect.topStart = dummyRect.top;
									dummyRect.topEnd = dummyRect.top + dummyRect.height;
								}
							}
							//c.topStart = c.top;
							c.topEnd = c.top + c.height;
						}
					}
					if (dummyRect.row > 0 && dummyRect.row - 1 === cardRectArray[cardRectArray.length - 1].row) {
						dummyRect.top = rowsTopEnd[dummyRect.row - 1];
						//dummyRect.topStart = dummyRect.top;
						dummyRect.topEnd = dummyRect.top + dummyRect.height;
					}
				}

				function recalculateCardsDimensionsAccordingToDummy(dummyPosition, pageX, pageY) {
					var toStart = dummyPosition - 1;
					var toEnd = dummyPosition < cardRectArray.length ? dummyPosition : cardRectArray.length - 1;
					if (!isInsideContainer) {
						hideDummy();
						if (cardRectArray.length > 0) {
							resetCards(cardRectArray);
						}
						return;
					}
					while (toStart >= 0) {
						//$window.console.log('toStart', toStart);
						resetDimensionsToBase(toStart, dummyPosition);
						toStart--;
					}

					//if (toStart >= 0) {
					////$window.console.log('toStart', toStart);
					//resetDimensionsToBase(toStart, dummyPosition);
					//}
					offsetDimensionsOfDummy(dummyPosition, cardRectArray.length);
					while (toEnd < cardRectArray.length) {
						if (toEnd >= 0) {
							//$window.console.log('toEnd', toEnd);
							offsetDimensionsAccordingToDummy(toEnd, dummyPosition, cardRectArray.length);
						}
						toEnd++;
					}
				}

				function offsetDimensionsOfDummy(index, length) {
					var r = dummyRect;
					if (length === 0) {
						r.top = r.orginalTop;
						r.topEnd = r.top + r.height;
						return;
					}
					//$window.console.log('offsetDimensionsOfDummy', index, limitsRectangle.top, cardRectFirstCurrent.top);
					var marginYoffsetForDummy = Math.min(cardRectFirst.marginBottom, dummyRect.marginTop);
					var marginBottomCollapsedWithDummyMarginTop = Math.max(cardRectFirst.marginBottom, dummyRect.marginTop) / 2;
					var marginBottomCollapsedWithDummyMarginBottom = Math.max(cardRectFirst.marginTop, dummyRect.marginBottom) / 2;

					var prevIndex = index > 0 ? index - 1 : 0;
					if (prevIndex === cardRectArray.length - 1) {
						if ((cardRectArray[prevIndex].top === dummyRect.top) && (cardRectArray[prevIndex].leftEnd + dummyRect.width <= (limitsRectangle.left + limitsRectangle.width))) {
							r.left = cardRectArray[prevIndex].leftEnd;
							r.leftEnd = r.left + r.width;
						} else {
							if (index === length) {
								if (cardRectArray[prevIndex].leftEnd + dummyRect.width <= (limitsRectangle.left + limitsRectangle.width)) {
									r.top = cardRectArray[prevIndex].top;
									r.left = cardRectArray[prevIndex].leftEnd;
									r.leftEnd = r.left + r.width;
								} else {
									r.top = cardRectArray[prevIndex].topEnd;
									r.left = limitsRectangle.left;
									r.leftEnd = r.left + r.width;
								}
							} else {
								r.top = cardRectArray[prevIndex].topEnd;
								r.left = limitsRectangle.left;
								r.leftEnd = r.left + r.width;
							}
						}
					} else {
						if (((cardRectArray[prevIndex].leftEnd + r.width) <= (limitsRectangle.left + limitsRectangle.width)) && index > 0) {
							r.top = cardRectArray[prevIndex].top;
							r.left = cardRectArray[prevIndex].leftEnd;
							r.leftEnd = r.left + r.width;
						} else {
							r.top = index > 0 ? cardRectArray[index - 1].topEnd : cardRectArray[0].top;
							r.left = limitsRectangle.left;
							r.leftEnd = r.left + r.width;
						}
					}

					//actual start according to margin collapse
					//r.top = index * (cardRectLast.height - marginYoffset) + (index > 0 ? marginYoffset - marginYoffsetForDummy : 0) + cardRectFirstCurrent.top;

					//visual middle poin between cards
					//r.topStart = r.top - (index === 0 ? 0 : (-r.marginTop + marginBottomCollapsedWithDummyMarginTop));
					//var topHeight = r.height - r.marginTop - r.marginBottom + marginBottomCollapsedWithDummyMarginTop + marginBottomCollapsedWithDummyMarginBottom;
					//if (index === 0) {
					//	topHeight = r.height - r.marginBottom + marginBottomCollapsedWithDummyMarginBottom;
					//} else if (index === length) {
					//	topHeight = r.height - r.marginTop + marginBottomCollapsedWithDummyMarginTop;
					//}
					//r.topEnd = r.topStart + topHeight;
					r.topEnd = r.top + r.height;
				}

				function offsetDimensionsAccordingToDummy(index, dummyPosition, length) {
					var marginYbottomOffsetForDummy = Math.min(cardRectFirst.marginTop, dummyRect.marginBottom);
					var marginTopCollapsedWithDummyMarginBottom = Math.max(cardRectFirst.marginTop, dummyRect.marginBottom) / 2;
					var r = cardRectArray[index];
					var prevIndex = index > 0 ? index - 1 : 0;
					if (index === dummyPosition) {
						if (dummyRect.leftEnd + cardRectArray[index].width <= (limitsRectangle.left + limitsRectangle.width)) {
							r.top = dummyRect.top;
							r.left = dummyRect.leftEnd;
							r.leftEnd = r.left + r.width;
						} else {
							r.top = index > 0 ? cardRectArray[index].topEnd : cardRectArray[0].top;
							r.left = limitsRectangle.left;
							r.leftEnd = r.left + r.width;
						}
					} else {
						if (cardRectArray[prevIndex].leftEnd + cardRectArray[index].width <= (limitsRectangle.left + limitsRectangle.width)) {
							r.top = cardRectArray[prevIndex].top;
							r.left = cardRectArray[prevIndex].leftEnd;
							r.leftEnd = r.left + r.width;
						} else {
							if (index === dummyPosition - 1 /*|| index === cardRectArray.length - 1*/) {
								r.top = cardRectArray[index].top;
								r.left = limitsRectangle.left;
								r.leftEnd = r.left + r.width;
							} else {
								r.top = index > 0 ? cardRectArray[index].topEnd : cardRectArray[0].top;
								r.left = limitsRectangle.left;
								r.leftEnd = r.left + r.width;
							}

						}
					}

					//r.top = top;// + dummyRect.height - marginYbottomOffsetForDummy + (index - dummyPosition) * (cardRectLast.height - marginYoffset);
					//if (index === dummyPosition) {
					//  r.top += dummyRect.height - marginYbottomOffsetForDummy;
					//}
					//r.topStart = r.top + ((index - dummyPosition) === 0 ? (-marginTopCollapsedWithDummyMarginBottom + r.marginTop) : (r.marginTop - marginYcollapsedSize));
					//var topHeight = r.height - r.marginTop - r.marginBottom + marginYcollapsedSize * 2;
					//if (index === dummyPosition && index === length - 1) {
					//	topHeight = r.height - r.marginTop + marginTopCollapsedWithDummyMarginBottom;
					//} else if (index === dummyPosition) {
					//	topHeight = r.height - r.marginTop - r.marginBottom + marginYcollapsedSize + marginTopCollapsedWithDummyMarginBottom;
					//} else if (index === length - 1) {
					//	topHeight = r.height - r.marginTop + marginYcollapsedSize;
					//}
					//r.topEnd = r.topStart + topHeight;
					r.topEnd = r.top + r.height;
				}

				function resetDimensionsToBase(index, dummyPosition) {
					var marginBottomCollapsedWithDummyMarginTop = Math.max(cardRectFirst.marginBottom, dummyRect.marginTop) / 2;
					var r = cardRectArray[index];
					var epsilon = r.marginTop;
					var prev = index > 0 ? index - 1 : 0;
					//actual start according to margin collapse
					//r.top = index * (cardRectLast.height - marginYoffset) + cardRectFirstCurrent.top;
					if ((r.top > dummyRect.top) && dummyRect.top > 0) {
						//if (dummyPosition - index === 1) {
						//	r.top = cardRectArray[prev].top;
						//	r.left = cardRectArray[prev].leftEnd;
						//	r.leftEnd = r.left + r.width;
						//} else {
						if ((Math.abs(r.left - limitsRectangle.left) <= epsilon) && (Math.abs(r.top - dummyRect.topEnd) <= epsilon || r.row - 1 === dummyRect.row) && dummyRect.left + r.width <= (limitsRectangle.left + limitsRectangle.width) && index === dummyPosition - 1 && (dummyRect.leftEnd + dummyRect.width > (limitsRectangle.left + limitsRectangle.width))) {
							r.top = dummyRect.top;
							r.left = dummyRect.leftEnd + r.width <= (limitsRectangle.left + limitsRectangle.width) ? dummyRect.leftEnd : dummyRect.left;
							r.leftEnd = r.left + r.width;
						} else {
							if ((Math.abs(r.left - limitsRectangle.left) <= epsilon) && (r.row - 1 === dummyRect.row) && (dummyRect.leftEnd + dummyRect.width > (limitsRectangle.left + limitsRectangle.width))) {
								r.top = dummyRect.top;
								r.left = dummyRect.left;
							} else {
								r.top = cardRectArray[prev].top;
								r.left = cardRectArray[prev].left;
							}
							r.leftEnd = r.left + r.width;
						}

						//if (r.top === cardRectArray[prev].top) {
						//r.left = cardRectArray[prev].left;
						//r.leftEnd = r.left + r.width;
						//} else {
						//if (cardRectArray[prev].left + r.width <= (limitsRectangle.left + limitsRectangle.width)) {
						//  r.top = cardRectArray[prev].top;
						//  r.left = cardRectArray[prev].left;
						//  r.leftEnd = r.left + r.width;
						//}
						//}
						//}
					} else if ((Math.abs(r.top - dummyRect.top) <= epsilon || r.row - 1 === dummyRect.row) && Math.abs(r.left - dummyRect.leftEnd) <= epsilon) {
						r.left = dummyRect.left;
						r.leftEnd = r.left + r.width;
					}
					else if ((Math.abs(r.top - dummyRect.top) <= epsilon || r.row - 1 === dummyRect.row) && r.left > dummyRect.left) {
						if ((index > -1) && ((dummyPosition - index === 1) || (Math.abs(r.left - dummyRect.leftEnd) <= epsilon))) {
							if (Math.abs(r.left - dummyRect.leftEnd) <= epsilon) {
								r.left = dummyRect.leftEnd;
								r.leftEnd = r.left + r.width;
							} else {
								r.left = cardRectArray[prev].left;
								r.leftEnd = r.left + r.width;
							}
						} else {
							r.left = cardRectArray[prev].left;
							r.leftEnd = r.left + r.width;
						}
					}


					//visual middle poin between cards
					//r.topStart = r.top - (index === 0 ? 0 : (-marginYoffset + marginYcollapsedSize));
					//var topHeight = r.height - r.marginTop - r.marginBottom + marginYcollapsedSize * 2;
					//if (index === 0 && index === dummyPosition - 1) {
					//	topHeight = r.height - r.marginBottom + marginBottomCollapsedWithDummyMarginTop;
					//} else if (index === 0) {
					//	topHeight = r.height - r.marginBottom + marginYcollapsedSize;
					//} else if (index === dummyPosition - 1) {
					//	//need to calc dummy margin
					//	topHeight = r.height - r.marginTop - r.marginBottom + marginYcollapsedSize + marginBottomCollapsedWithDummyMarginTop;
					//
					//}
					//r.topEnd = r.topStart + topHeight;
					r.topEnd = r.top + r.height;
				}

				function hideDummy() {
					var r = dummyRect;
					r.top = -r.height;
					r.topEnd = r.top + r.height;
				}

				scope.$on('cardDragStarted', function () {

					var cardDragProcess = scope.$on('cardDragProcess', function (e, data) {
						//TODO: add support for page scroll offset
						handleMoveAction(data.event.pageX, data.event.pageY - scrollTop);
					});
					var cardDragEnded = scope.$on('cardDragEnded', function (e, dragedElemData) {
						//$window.console.log('cardDragEnded');
						cardDragProcess();
						cardDragEnded();

						element.unbind('mouseup', bindMouseUpListener);

						//if in my square
						if (isInsideContainer) {
							isInsideContainer = false;
							var pay = getPayloadData();

							$rootScope.$broadcast('cardDrop', {
								event: e,
								data: angular.extend(dragedElemData, pay),
								element: mainSelectedCardElement,
								movePosition: moveToPosition || {}
							});
							if (!_dragDirectiveModeArea) {
								dragContainerCalculationUtils.repositionItemsBasedOnHoverPosition(cardRectArray, cardRectArray.length, dummyRect);
							}
							fireLeaveContainerEvent();

						}
						markedDisabledItems = [];
						markCardItemsAsDisabled();
						dragContainerCalculationUtils.printArrayUtil(cardRectArray, dummyRect);
					});
				});
				element.bind('mousedown', function (e) {
					if (e.button === 2 || e.button === 1) {
						return;
					}
					scope.$apply(function () {
						var elementTarget = e.target;
						if (elementTarget.tagName.toLowerCase() === 'input') {
							return;
						}
						e.preventDefault();

						//check if mouse down event is originated on card
						if (angular.element(elementTarget).parents('.' + DraggableElementSelector).length || angular.element(elementTarget).hasClass(DraggableElementSelector)) {
							mainSelectedCardElement = angular.element(elementTarget).hasClass(DraggableElementSelector) ? elementTarget : angular.element(elementTarget).parents('.' + DraggableElementSelector)[0];
							var pos = parseInt(mainSelectedCardElement.getAttribute('index'));
							scope.toggleCheck(pos, true);

							initialMouseDownPageX = e.pageX;
							initialMouseDownPageY = e.pageY;
							dragStarted = false;

							//initiating move listener only on current cell element
							element.bind('mousemove', elementMoveListener);
							element.bind('mouseup', bindMouseUpListener);
						}
					});
					if (_dragToggledModeActive) {
						setDragDirectiveModeArea(false);
						var mouseUp = function () {
							$document.unbind('mouseup', mouseUp);
							setDragDirectiveModeArea(true);
						};
						$document.bind('mouseup', mouseUp);
					}
				});

				function initDrag(e, cardElem) {
					dragStarted = true;
					element.unbind('mousemove', elementMoveListener);

					//TODO: start this element mouseenter indication
					//$window.console.log('init my square');

					//initiateVirtualDragData();
					//$window.console.log('initDrag');

					//remove local mousemove listener and broadcast drag started event
					var dragStartArgs = {
						event: e,
						data: getPayloadData(),
						element: cardElem
					};

					dragStartArgs.data.boardZoomLevel = scope.boardZoomLevel;
					$rootScope.$broadcast('cardDragStarted', dragStartArgs);
				}

				function bindMouseUpListener() {
					//$window.console.log('bindMouseUpListener' + dragStarted);

					//check with move calculation
					if (!dragStarted) {
						element.unbind('mousemove', elementMoveListener);
					}
					element.unbind('mouseup', bindMouseUpListener);
					dragStarted = false;
				}

				function elementMoveListener(e) {
					if (!dragStarted) {
						var dx = e.pageX - initialMouseDownPageX;
						var dy = e.pageY - initialMouseDownPageY;
						var d = Math.sqrt(dx * dx + dy * dy);
						if (d >= 1) {
							initDrag(e, mainSelectedCardElement);
						}
					}
				}

				function createDraggableDummyElement(template, dummyParentContainer, dummyElementClass) {
					var dummyProxy = $document[0].createElement('DIV');
					dummyProxy.setAttribute('class', dummyElementClass);
					dummyProxy.innerHTML = template;
					dummyProxy.style.display = 'none';
					dummyParentContainer.appendChild(dummyProxy);
					dummYComputedStyle = $window.getComputedStyle(dummyProxy);
					return dummyProxy;
				}

				dummy = createDraggableDummyElement(_codeTemplate, element[0], _dragDirectiveModeArea ? _dummyAreaStyle : _dummyStyle);

				function fireLeaveContainerEvent() {
					//cardRectFirstCurrent = cardRectFirst;
					limitsRectangle = contRect;
					dummy.style.display = 'none';
					//$window.console.log('fire leave');
					isInsideContainer = false;
					//
					element.removeClass(_containterOverStyle);
					if (!_dragDirectiveModeArea) {
						potentialOtherCellExpandNotification();
					}

				}

				function adjustDummySize() {
					if (containerParentRect && containerParentRect.height > 0) {
						//console.log('rect',limitsRectangle);
						var top = Math.max(containerParentRect.top - limitsRectangle.top, 0);
						var dragRectStartPositionRelativeToPageTop = limitsRectangle.top + top;
						var boundryRectBottomContainer = containerParentRect.top + containerParentRect.height;
						var boundryRectBottomCell = limitsRectangle.top + limitsRectangle.height;
						var height = (Math.min(boundryRectBottomContainer, boundryRectBottomCell) - dragRectStartPositionRelativeToPageTop);
						dummy.style.height = height + 'px';
						dummy.style.top = top + 'px';
					}
				}

				function fireEnterContainerEvent() {
					//$window.console.log('fire enter');
					//cardRectFirstCurrent = cardRectFirstWithDummy;
					limitsRectangle = contRectWithDummy;
					if (_dragDirectiveModeArea) {
						contRect = dragContainerDomUtils.getfixedRectHeight(element[0]);
						limitsRectangle = contRect;
						dummy.style.width = limitsRectangle.width + 'px';
						adjustDummySize();
						dummy.style.margin = 0;
					} else {
						//dummy.style.width = mainSelectedCardElement.clientWidth + 'px';
						dummy.style.width = cardRectArray[indexSelectedDraggedCard].innerWidth + 'px';
						//dummy.style.height = mainSelectedCardElement.clientHeight + 'px';
						dummy.style.height = cardRectArray[indexSelectedDraggedCard].innerHeight + 'px';
						dummy.style.marginTop = cardRectArray[indexSelectedDraggedCard].marginTop + 'px';
						dummy.style.marginBottom = cardRectArray[indexSelectedDraggedCard].marginBottom + 'px';
						dummy.style.marginLeft = cardRectArray[indexSelectedDraggedCard].marginLeft + 'px';
						dummy.style.marginRight = cardRectArray[indexSelectedDraggedCard].marginRight + 'px';
						potentialOtherCellExpandNotification();
					}
					dummy.style.display = 'inline-block';

					element.addClass(_containterOverStyle);
				}

				function potentialOtherCellExpandNotification() {
					$timeout(function () {
						//TODO: better solution fo resize notifications for other cells
						$rootScope.$broadcast('draggableComponentRefresh');
					});
				}

				function createDropMoveData(pos) {
					moveToPosition = {};
					if (pos < cardRectArray.length) {
						moveToPosition.before = pos;
					} else {
						moveToPosition.after = cardRectArray.length - 1;
					}
				}

				function checkToRepositionDummy(pos) {
					if (pos < cardRectArray.length) {
						element[0].insertBefore(dummy, cardRectArray[pos].card);
					} else {
						element[0].appendChild(dummy);
					}
				}

			}
		};
	});

	angular.module('platform-board').factory('dragContainerDomUtils', /*@ngInject*/ function ($document, $timeout) {
		var ctx;

		function getfixedRectHeight(elem, noPadding, checkChildren) {
			var elemRect = getfixedRectHeightInner(elem, noPadding);

			//$window.console.log('childElem', elem, elemRect);
			if (!checkChildren) {
				return elemRect;
			}
			var r = elem;
			var loopCounter = 0;
			while (r.firstElementChild) {
				r = r.firstElementChild;
				var r1 = getfixedRectHeightInner(r, noPadding);

				elemRect.marginBottom = elemRect.marginBottom || r1.marginBottom;
				elemRect.marginTop = elemRect.marginBottom || r1.marginTop;
				elemRect.marginLeft = elemRect.marginBottom || r1.marginLeft;
				elemRect.marginRight = elemRect.marginBottom || r1.marginRight;

				//$window.console.log('childElem', r, r1, loopCounter);
				if (r1.height > elemRect.height) {
					r1.innerWidth = r1.width - r1.marginLeft - r1.marginRight;
					r1.innerHeight = r1.height - r1.marginTop - r1.marginBottom;
					//if the child element is taller then the origin
					if (r1.marginTop === 0 && r1.marginBottom === 0 && r.firstElementChild) {
						return getfixedRectHeightInner(r.firstElementChild, noPadding);
					}
					return r1;
				} else if (r1.height < elemRect.height) {
					elemRect.innerWidth = r1.width;
					elemRect.innerHeight = r1.height;
					if (elemRect.marginTop === 0 && elemRect.marginBottom === 0) {
						var marginVertically = elemRect.height - r1.height;
						marginVertically = marginVertically > 10 ? marginVertically / 2 : marginVertically;
						elemRect.marginTop = elemRect.marginBottom = marginVertically;
					}
					if (elemRect.marginLeft === 0 && elemRect.marginRight === 0) {
						var marginHorizontally = elemRect.width - r1.width;
						marginHorizontally = marginHorizontally > 10 ? marginHorizontally / 2 : marginHorizontally;
						elemRect.marginLeft = elemRect.marginRight =  marginHorizontally;
					}
					return elemRect;
				}
				loopCounter++;
				if (loopCounter > 5) {
					throw new Error('Loop too deep!');
				}
			}
		}

		function getfixedRectHeightInner(elem, noPadding) {
			var boundingRect = elem.getBoundingClientRect();
			var rect = {
				top: boundingRect.top,
				height: boundingRect.height,
				left: boundingRect.left,
				width: boundingRect.width,
				marginTop: 0,
				marginBottom: 0,
				marginLeft: 0,
				marginRight: 0
			};
			if (!noPadding) {
				var computedStyle = window.getComputedStyle(elem);
				rect.marginTop = parseInt(computedStyle.marginTop, 10);
				rect.marginLeft = parseInt(computedStyle.marginLeft, 10);
				rect.marginBottom = parseInt(computedStyle.marginBottom, 10);
				rect.marginRight = parseInt(computedStyle.marginRight, 10);
				rect.orginalTop = rect.top = rect.top - rect.marginTop;
				rect.orginalLeft = rect.left = rect.left - rect.marginLeft;
				rect.height = rect.height + rect.marginBottom + rect.marginTop;
				rect.width = rect.width + rect.marginRight + rect.marginLeft;
			}

			return rect;
		}

		function initDebug() {
			if (!ctx) {
				var c = $document[0].createElement('CANVAS');
				c.setAttribute('width', '2000');
				c.setAttribute('height', '2000');
				c.setAttribute('style', 'position:absolute;top:-3px;left:450px;border:3px solid #c3c3c3;z-index:10;pointer-events:none;opacity:.5');
				(angular.element('body')[0]).appendChild(c);
				ctx = c.getContext('2d');
				(angular.element('body')[0]).style.overflow = 'hidden';
			}
		}

		function drawCanvasVisualisation(x, y, limitsRectangle, cardsArray, dm, isInsideContainer) {
			if (!ctx || !isInsideContainer) {
				return;
			}
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, 2000, 1000);
			ctx.fillStyle = isInsideContainer ? '#ccc' : '#eee';
			ctx.fillRect(limitsRectangle.left, limitsRectangle.top, limitsRectangle.width, limitsRectangle.height);

			//draw cards
			var d = 1;
			for (var i = 0; i < cardsArray.length; i++) {
				var r = cardsArray[i];
				if (!r.color) {
					var opacity = ((i % 4) + 5.0) / 10;
					r.color = 'rgba(' + (d > 0 ? '0, 255' : ' 255, 0') + ', 0, ' + (r.disabled ? '.2' : +opacity) + ')';
				}
				d *= -1;
				ctx.fillStyle = r.color;
				ctx.fillRect(r.left, r.top, r.width, r.topEnd - r.top);
			}

			//draw dummy
			if (dm) {
				ctx.fillStyle = 'rgba(0,0,0,.5)';
				ctx.fillRect(dm.left, dm.top, dm.width, dm.topEnd - dm.top);
			}

			//draw cursor
			ctx.fillStyle = '#FF0000';
			ctx.fillRect(x, y + 2, 1, 10);
			ctx.fillRect(x, y - 11, 1, 10);
			ctx.fillRect(x + 2, y, 10, 1);
			ctx.fillRect(x - 11, y, 10, 1);
		}

		function debounce(func, wait, immediate) {
			var timeout;
			return function () {
				var context = this,
					args = arguments;
				var later = function () {
					timeout = null;
					if (!immediate) {
						func.apply(context, args);
					}
				};
				var callNow = immediate && !timeout;
				clearTimeout(timeout);
				timeout = $timeout(later, wait);
				if (callNow) {
					func.apply(context, args);
				}
			};
		}

		return {
			getfixedRectHeight: getfixedRectHeight,
			initDebug: initDebug,
			drawCanvasVisualisation: drawCanvasVisualisation,
			debounce: debounce
		};
	});

	angular.module('platform-board').factory('dragContainerCalculationUtils', /*@ngInject*/ function ($window) {
		function repositionItemsBasedOnHoverPosition(cardArray, markPosition, dummyRect) {
			//adjust proxy rectangles positions
			var toStart = markPosition - 1;
			var toEnd = markPosition;
			if (markPosition > -1 && markPosition < cardArray.length) {
				dummyRect.top = cardArray[markPosition].orginalTop;
			} else if (markPosition >= cardArray.length) {
				dummyRect.top = 0;
				if (cardArray.length > 0) {
					dummyRect.top = cardArray[cardArray.length - 1].orginalTop + cardArray[cardArray.length - 1].height;
				}
			}
			while (toStart >= 0) {
				cardArray[toStart].top = cardArray[toStart].orginalTop;
				toStart--;
			}
			while (toEnd < cardArray.length) {
				cardArray[toEnd].top = cardArray[toEnd].orginalTop + dummyRect.height;
				toEnd++;
			}
		}

		function findBestPosition(cardArray, hoverPosition, previouslyMarkedPosition) {
			var foundPosition = -1;
			var toStart = hoverPosition;
			var toEnd = hoverPosition + 1;
			while (toStart >= 0) {
				if (!cardArray[toStart].disabled) {
					toStart++;
					break;
				}
				toStart--;
			}
			if (foundPosition >= 0) {
				return foundPosition;
			}
			while (toEnd < cardArray.length) {
				if (!cardArray[toEnd].disabled) {
					break;
				}
				toEnd++;
			}
			if (previouslyMarkedPosition !== -1 && previouslyMarkedPosition === toStart) {
				return toStart;
			}
			if (previouslyMarkedPosition !== -1 && previouslyMarkedPosition === toEnd) {
				return toEnd;
			}
			if (toStart >= 0) {
				return toStart;
			}
			if (toEnd < cardArray.length) {
				return toEnd;
			}
			return foundPosition;
		}

		function findBestPositionAccordingSides(cardArray, pageX, pageY) {
			var position = -1;
			for (var i = 0; i < cardArray.length; i++) {
				if (cardArray[i].left < pageX && cardArray[i].leftEnd > pageX && cardArray[i].top < pageY && cardArray[i].topEnd > pageY) {
					if (pageX < (cardArray[i].left + cardArray[i].width / 2)) {
						// we are in the left half of the card
						position = i;
					} else {
						// we are in the right half of the card
						position = i + 1;
					}

				}
			}
			//if (position === 0) {
			//  position = 1;
			//}
			return position;
		}

		function findBestPositionAccordingHeight(cardArray, pageX, pageY) {
			var position = -1;
			for (var i = 0; i < cardArray.length; i++) {
				if (cardArray[i].left < pageX && cardArray[i].leftEnd > pageX && cardArray[i].top < pageY && cardArray[i].topEnd > pageY) {
					if (pageY < (cardArray[i].top + cardArray[i].height / 2)) {
						// we are in the top half of the card
						position = i;
					} else {
						// we are in the bottom half of the card
						position = i + 1;
					}
				}
			}
			return position;
		}

		function isMoreThanOneCardInRowCell(cardArray, dummyRect, limitsRectangle) {
			var isMoreThanOneCardInCellRow = false;
			if (cardArray.length > 1) {
				if ((cardArray[1].left !== limitsRectangle.left) || (cardArray[1].left === limitsRectangle.left && cardArray[0].leftEnd === dummyRect.left)) {
					isMoreThanOneCardInCellRow = true;
				}
			}
			return isMoreThanOneCardInCellRow;
		}

		function findMousePositionOnCard(cardRect, pageX, pageY) {
			var center = {
				x: cardRect.left + cardRect.width / 2,
				y: cardRect.top + cardRect.height / 2,
				ang: Math.atan2((cardRect.height / 2), (cardRect.width / 2))
			};
			if (pageY > cardRect.top && pageY <= cardRect.top + cardRect.height && pageX > cardRect.left && pageX <= cardRect.left + cardRect.width) {
				// mouse direction relative to card center
				var ang = Math.atan2(center.y - pageY, center.x - pageX);
				if (ang > Math.PI - center.ang || ang < -Math.PI + center.ang) {
					return 'right';
				} else if (ang > -Math.PI + center.ang && ang < 0 - center.ang) {
					return 'bottom';
				} else if (ang > 0 - center.ang && ang < center.ang) {
					return 'left';
				} else {
					return 'top';
				}
			} else {
				return 'out';
			}
		}

		function isInsideCurrentElementLimits(pageX, pageY, currentContainer, parentContainerRect) {
			//TODO: if not provided parent element, check against page borders
			if (parentContainerRect && parentContainerRect.height > 0 && parentContainerRect.width > 0) {
				return pageY > Math.max(currentContainer.top, parentContainerRect.top) &&
					pageY < Math.min(currentContainer.top + currentContainer.height, parentContainerRect.top + parentContainerRect.height) &&
					pageX > Math.max(currentContainer.left, parentContainerRect.left) &&
					pageX < Math.min(currentContainer.left + currentContainer.width, parentContainerRect.left + parentContainerRect.width);
			}
			return pageY > currentContainer.top && pageY < currentContainer.top + currentContainer.height &&
				pageX > currentContainer.left && pageX < currentContainer.left + currentContainer.width;
		}

		function compareRectangles(c1, c2) {
			if (!c1 || !c2) {
				return false;
			}
			return c1.top === c2.top && c1.left === c2.left && c1.width === c2.width && c1.height === c2.height;
		}

		function isElementAndSiblingDisabled(cardArray, index, isUpperHalfCheck) {
			if (isUpperHalfCheck) {
				return (cardArray[index].disabled && index > 0 && cardArray[index - 1].disabled) || (index === 0 && cardArray[index].disabled);
			}
			return (cardArray[index].disabled && index < cardArray.length - 1 && cardArray[index + 1].disabled) || (cardArray[index].disabled && index === cardArray.length - 1);
		}

		function isInsideCurrentCardUpperLimits(pageY, card) {
			var hgt = card.topEnd - card.top;
			return pageY >= card.top && pageY < card.top + hgt / 2;
		}

		function isInsideCurrentCardLowerLimits(pageY, card) {
			var hgt = card.topEnd - card.top;
			return pageY >= card.top + hgt / 2 && pageY < card.top + hgt;
		}

		function isInsideDummyLimits(pageY, dm) {
			return pageY >= dm.top && pageY < dm.topEnd;
		}

		function isInsideCurrentElementUpperLimits(pageY, cards, dm) {
			//0 length case
			if (cards.length === 0) {
				return true;
			} else if (dm.top < 0) {
				return pageY < cards[0].top;
			}

			//$window.console.log(pageY, dm.topStart, cards[0].topStart);
			return pageY < Math.min(cards[0].top, dm.top);
		}

		function isInsideCurrentElementLowerLimits(pageY, cards, dummyRectTopEnd) {
			return pageY > Math.max(cards[cards.length - 1].topEnd, dummyRectTopEnd);
		}

		function printArrayUtil(cardRectArray, dummyRect) {
			var arr = [];
			for (var i = 0; i < cardRectArray.length; i++) {
				arr.push({
					i: i,
					t: cardRectArray[i].top,
					h: cardRectArray[i].height,
					o: cardRectArray[i].orginalTop,
					d: cardRectArray[i].disabled
				});
			}
			arr.push(dummyRect);
			//$window.console.log(JSON.stringify(arr));
		}

		return {
			repositionItemsBasedOnHoverPosition: repositionItemsBasedOnHoverPosition,
			findBestPosition: findBestPosition,
			findBestPositionAccordingSides: findBestPositionAccordingSides,
			findBestPositionAccordingHeight: findBestPositionAccordingHeight,
			isMoreThanOneCardInRowCell: isMoreThanOneCardInRowCell,
			findMousePositionOnCard: findMousePositionOnCard,
			isInsideCurrentElementLimits: isInsideCurrentElementLimits,
			compareRectangles: compareRectangles,
			isElementAndSiblingDisabled: isElementAndSiblingDisabled,
			isInsideCurrentCardUpperLimits: isInsideCurrentCardUpperLimits,
			isInsideCurrentCardLowerLimits: isInsideCurrentCardLowerLimits,
			isInsideDummyLimits: isInsideDummyLimits,
			isInsideCurrentElementUpperLimits: isInsideCurrentElementUpperLimits,
			isInsideCurrentElementLowerLimits: isInsideCurrentElementLowerLimits,
			printArrayUtil: printArrayUtil
		};
	});
})();
/* jshint ignore:end */
/*eslint-enable */

// jscs:enable
