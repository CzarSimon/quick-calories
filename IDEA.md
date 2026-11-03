# Personal Calorie Tracker

## Overview
I would like to build a personal tool to track my calories over the week. I have tried many different macro trackers before and found it to much of a hassle to register the food I eat.

I would like to build a tool that is exactly optimised for my situation and makes it convenient for me to track my calories.

## My Situation
I am a fairly high level amateur runner and I run approx 90 km per week + two gym sessions. My caloric need is periodised across the week, days with a lot of training require a lot of calories and specifically getting engough carbohydrates is crucial to perform and recover from the training. Adequate protein is also important to build and repair muscle tissue. Fats are important to get the daily minium amount however outside of the minium amount it does not have an important place.

For a good runner i am quite heavy and recently dropped 5 kilos from 87 to 82 kg. I am 182 cm tall and currently have around 11% body fat. Thus my main goal is to maintain weight, get enough fuel to carry out my training but not so much that I gain weight.

One key aspect of my week is that i largely do not train on weekends and thus my caloric need is much lower on those days. However during the weekend my food environment is much less controlled (fika, having ppl over for dinner, desserts etc.).

I will in periods want to be in periods where I loose some additional weight and in those situation I will want to reduce my weekly calories modestly. 

## Standarization of food
During most of my week and most of my days my intake is very standarized. I eat the same thing for breakfast as a base with deliberete modifications to adjust for the planned intensity and volume of the training day. Simliarly for lunch I have the same thing with deliberate additions on days I need more calories. 

You can essentially say that on mondays i eat the same thing every week for breakfast, snacks (different quantites of fruit), lunch and evening snack. For tuesdays similarly i have the same thing except for dinner. And so on througout the work week. On weekends and on holidays my food environment get much less controlled as then I eat in line with what my family eat. 

Holidays are also different from normal weeks in that I reduce training and this caloric need for extended periods of time, sometimes a few days sometimes a month. In those situations is also eat less standardized.

## Problems with current trackers
My main issue with current tracking is that it takes to much effort unececarliy. Given my degree of standarization in my diet most tracking during the week would just be to confirm that I ate acording to my plan for the day. On monday at 9 I would just need to be prompted and asked to confirm that I ate what I had scheduled. By 11:30 i would just need to be promted that i have had my pre lunch snacks (e.g 2 bananas and and apple). At 13:00 that i have had the planned lunch etc. 
Given that my evening snack is also planned I should be able to see my calory and macro budget for dinner and my projected macros and calories for the day in releation to my goal. 
Most of my meals are standardized and can thus be exactly configured. The unstandardized meals (workweek dinners, weekend and holiday food in general) need to be manually added but there my family does have recipes that we rotate so anything that I log once is likely to be repeated again in the future and thus can be addeded to the personal food library. I have no problem with initial setup of a meal in a food library.

## Prefered solution
I would like to have the tool as a native app (React Native with Expo). 

I would like to discuss structuring data and core concepts together but so please consider what is written below as high level concepts rather than concrete suggestions of implementation.

At its core i would like to have the ability to create schedules (consumption schedules or similar), these must have calories and macros per day of the week. Each day should be able to have planned meals (planned breakfast, planned lunch planned snacks etc.). At defined times I would like to get notified by the app that I should confirm what I have eaten and potentially add, remove or adjust the planned meals.
I would want to see my progress towards my calorie and macro goals of the day both absolute and projected.
I would also like to see the calorie and macro budget for my unstandardized meals in a day.
The main way to add a meal would be to create it and add it to the library, i see no particular need to have an global food library that all users share, rather I will have to put in some efforrt in adding my own meals as the tradeoff of then having a very automated flow of tracking my standardized meals in my food library.

A food schedule should have the option to have a weekly caloric goal, these would be in relation to weight maintenence, i.e. the default is to be in caloric balance in the week, but I will sometimes want to be in X calories deficit for the week or Y calories surplus. Progress towards this should be clearly legible in the app.

It should be easy to create, edit, duplicate and delete schedules. I would also be able to label a schedule (and create labels).